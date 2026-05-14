import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, remove, writeFile } from "@tauri-apps/plugin-fs";

import { commands as tauriCommands, type ProjectFileTextExtraction } from "@/types/tauri.gen";
import { commands as dbCommands, type ProjectFile, type ProjectFileExtraction } from "@typr/plugin-db";

export const projectFileQueryKeys = {
  all: "project-files",
  list: "project-files:list",
  extractions: "project-files:extractions",
} as const;

export function listProjectFiles(projectId: string) {
  return dbCommands.listProjectFiles(projectId);
}

export function listProjectFileExtractions(projectId: string) {
  return dbCommands.listProjectFileExtractions(projectId);
}

export async function addProjectFiles(projectId: string, files: FileList | File[]) {
  const projectFiles: ProjectFile[] = [];
  const appData = await appDataDir();
  const projectDirectory = await join(appData, "project-files", projectId);
  await mkdir(projectDirectory, { recursive: true });

  for (const file of Array.from(files)) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const storagePath = await join(projectDirectory, `${id}-${sanitizeFileName(file.name)}`);

    await dbCommands.upsertProjectFile({
      id,
      project_id: projectId,
      name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      storage_path: storagePath,
      status: "Importing",
      error_message: null,
      created_at: now,
      updated_at: now,
    });

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await writeFile(storagePath, data);
      const saved = await dbCommands.upsertProjectFile({
        id,
        project_id: projectId,
        name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: storagePath,
        status: "Done",
        error_message: null,
        created_at: now,
        updated_at: new Date().toISOString(),
      });
      await saveProjectFileExtraction(saved);
      projectFiles.push(saved);
    } catch (error) {
      await dbCommands.upsertProjectFile({
        id,
        project_id: projectId,
        name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: storagePath,
        status: "Failed",
        error_message: error instanceof Error ? error.message : String(error),
        created_at: now,
        updated_at: new Date().toISOString(),
      });
    }
  }

  return projectFiles;
}

export async function deleteProjectFile(file: ProjectFile) {
  if (await exists(file.storage_path)) {
    await remove(file.storage_path);
  }

  await dbCommands.deleteProjectFile(file.id);
}

export async function retryProjectFileExtraction(file: ProjectFile) {
  if (file.status !== "Done") {
    throw new Error("This file was not saved. Remove it and add it again.");
  }

  return saveProjectFileExtraction(file);
}

async function saveProjectFileExtraction(file: ProjectFile) {
  const now = new Date().toISOString();

  await dbCommands.upsertProjectFileExtraction({
    file_id: file.id,
    status: "Pending",
    text_content: null,
    content_hash: null,
    char_count: 0,
    error_message: null,
    extracted_at: null,
    updated_at: now,
  });

  try {
    const extraction: ProjectFileTextExtraction = await tauriCommands.extractProjectFileText(
      file.storage_path,
      file.name,
      file.mime_type,
    );
    const normalizedText = extraction.text_content?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() ?? "";

    if (!normalizedText) {
      return dbCommands.upsertProjectFileExtraction({
        file_id: file.id,
        status: "Unsupported",
        text_content: null,
        content_hash: null,
        char_count: 0,
        error_message: extraction.unsupported_reason ?? getUnsupportedExtractionMessage(file.name),
        extracted_at: null,
        updated_at: new Date().toISOString(),
      });
    }

    const extractedAt = new Date().toISOString();
    const row: ProjectFileExtraction = {
      file_id: file.id,
      status: "Done",
      text_content: normalizedText,
      content_hash: await hashText(normalizedText),
      char_count: normalizedText.length,
      error_message: null,
      extracted_at: extractedAt,
      updated_at: extractedAt,
    };

    console.info("[project-files] extraction saved", {
      fileId: file.id,
      kind: extraction.extraction_kind,
      sourceUnits: extraction.source_units,
      chars: row.char_count,
    });

    return dbCommands.upsertProjectFileExtraction(row);
  } catch (error) {
    return dbCommands.upsertProjectFileExtraction({
      file_id: file.id,
      status: "Failed",
      text_content: null,
      content_hash: null,
      char_count: 0,
      error_message: error instanceof Error ? error.message : String(error),
      extracted_at: null,
      updated_at: new Date().toISOString(),
    });
  }
}

function getUnsupportedExtractionMessage(name: string) {
  const normalizedName = name.toLowerCase();
  if (normalizedName.endsWith(".pdf")) {
    return "No readable PDF text found. Scanned/image-only PDFs need OCR, which is not available yet.";
  }
  if (normalizedName.endsWith(".doc")) {
    return "Legacy .doc extraction is not available yet. Save the document as DOCX and add it again.";
  }
  if (normalizedName.endsWith(".docx")) {
    return "No readable DOCX text found.";
  }

  return "This file is saved to the project, but text extraction is not available for this file type yet.";
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function hashText(text: string) {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index) | 0;
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
