// @vitest-environment jsdom

import { i18n as globalI18n, setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsSection } from "@/components/left-sidebar/projects-section";
import NotesList, { NoteItem } from "@/components/left-sidebar/notes-list";
import { BulkActionBar } from "@/components/left-sidebar/bulk-delete-button";
import {
  endNoteProjectDrag,
  NOTE_PROJECT_DRAG_TYPE,
  startNoteProjectDrag,
} from "@/lib/note-project-drag";
import { projectQueryKeys, type Project } from "@/lib/projects";

const testMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  listProjects: vi.fn(),
  listSessionsByProject: vi.fn(),
  assignSessionToProject: vi.fn(),
  markAndEnqueueProjectBriefRefresh: vi.fn(),
  trackEvent: vi.fn(),
  toast: vi.fn(),
  sessionGetEvent: vi.fn(),
  listSessions: vi.fn(),
  insertSession: vi.fn(),
  sessionState: { current: {} as Record<string, unknown> },
  noteTitleRender: vi.fn(),
  noteRowMount: vi.fn(),
  noteRowUnmount: vi.fn(),
  toggleNote: vi.fn(),
  clearSelection: vi.fn(),
  multiSelect: { current: {} as Record<string, unknown> },
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/app" }),
  useMatch: () => null,
  useNavigate: () => testMocks.navigate,
}));

vi.mock("motion/react", async () => {
  const React = await import("react");
  const passthrough = (tag: string) => (props: Record<string, unknown>) => {
    const { layout, initial, animate, exit, transition, ...domProps } = props;
    return React.createElement(tag, domProps);
  };
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: passthrough("button"), div: passthrough("div") },
    useReducedMotion: () => true,
  };
});

vi.mock("@/components/projects/create-project-dialog", () => ({ CreateProjectDialog: () => null }));
vi.mock("@/components/projects/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/components/left-sidebar/marquee-title", async () => {
  const React = await import("react");
  return {
    MarqueeTitle: ({ text }: { text: string }) => {
      testMocks.noteTitleRender();
      React.useEffect(() => {
        testMocks.noteRowMount();
        return () => testMocks.noteRowUnmount();
      }, []);
      return React.createElement("span", null, text);
    },
  };
});
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user-1", thankYouSessionId: "thank-you" }) }));
vi.mock("@/hooks/enhance-pending", () => ({ useEnhancePendingState: () => false }));
vi.mock("@/hooks/useMultiSelectKeyboard", () => ({ useMultiSelectKeyboard: vi.fn() }));
vi.mock("@/hooks/useBulkDelete", () => ({ useBulkDelete: () => ({ handleBulkDelete: vi.fn(), isDeleting: false }) }));
vi.mock("@/stores/useMultiSelectNotes", () => ({ useMultiSelectNotes: () => testMocks.multiSelect.current }));
vi.mock("@typr/utils/contexts", () => ({
  useSession: (_sessionId: string, selector: (state: unknown) => unknown) => selector({
    session: {
      title: "Dragged note",
      created_at: "2026-10-01T12:00:00.000Z",
      record_start: null,
      needs_enhance: false,
    },
  }),
  useSessions: (selector: (state: unknown) => unknown) => selector({
    sessions: testMocks.sessionState.current,
    insert: testMocks.insertSession,
  }),
}));
vi.mock("@typr/plugin-db", () => ({
  commands: { sessionGetEvent: testMocks.sessionGetEvent, listSessions: testMocks.listSessions },
}));
vi.mock("@typr/plugin-misc", () => ({ commands: { deleteSessionFolder: vi.fn() } }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ confirm: vi.fn() }));
vi.mock("@/utils/delete-session", () => ({ deleteSessionWithWelcomeDismissal: vi.fn() }));
vi.mock("@/utils/session-cache", () => ({ removeSessionsFromCache: vi.fn() }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLog: vi.fn() }));
vi.mock("@typr/ui/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, onClick, ...props }: Record<string, any>) => createElement("button", {
    ...props,
    type: "button",
    role: "checkbox",
    "aria-checked": checked,
    onClick: (event: MouseEvent) => {
      onClick?.(event);
      onCheckedChange?.(!checked);
    },
  }),
}));
vi.mock("@typr/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) =>
    createElement("button", { type: "button", onClick: onSelect }, children),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@typr/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
  PopoverContent: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@typr/ui/components/ui/badge", () => ({
  NumberBadge: ({ value, ...props }: { value: number }) => createElement("span", props, value),
}));
vi.mock("@typr/ui/components/ui/button", () => ({
  Button: ({ children, variant: _variant, size: _size, ...props }: Record<string, any>) =>
    createElement("button", props, children),
}));
vi.mock("@typr/ui/components/ui/skeleton", () => ({ Skeleton: () => createElement("div") }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: testMocks.toast }));
vi.mock("@/lib/projects", () => ({
  projectQueryKeys: {
    all: "projects",
    detail: "project",
    sessions: "project-sessions",
    includedSessions: "project-included-sessions",
    sources: "project-sources",
    sessionMemberships: "project-session-memberships",
    noteCandidates: "project-note-candidates",
    legacyAll: "spaces",
    legacyDetail: "space",
    legacySessions: "space-sessions",
  },
  listProjects: testMocks.listProjects,
  listSessionsByProject: testMocks.listSessionsByProject,
  getRecentProjects: (projects: Project[], limit: number) => projects.slice(0, limit),
  assignSessionToProject: testMocks.assignSessionToProject,
  isProjectQueryKey: (key: unknown) => typeof key === "string" && key.includes("project"),
  getProjectActionErrorMessage: (error: unknown) => error instanceof Error ? error.message : "failed",
}));
vi.mock("@/lib/project-knowledge-jobs", () => ({
  markAndEnqueueProjectBriefRefresh: testMocks.markAndEnqueueProjectBriefRefresh,
  projectKnowledgeJobQueryKeys: { byProject: "project-knowledge-jobs:project" },
}));
vi.mock("@/lib/project-briefs", () => ({
  projectBriefQueryKeys: { latest: "project-brief:latest", freshness: "project-brief:freshness" },
}));
vi.mock("@/utils/analytics-events", () => ({ trackEvent: testMocks.trackEvent }));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });
i18n.load("en", {});
i18n.activate("en");
globalI18n.load("en", {});
globalI18n.activate("en");
const noteId = "b7a142ad-a44d-4c6d-aabd-30c40dcfc41b";
const otherNoteId = "b7a142ad-a44d-4c6d-aabd-30c40dcfc42c";
const projectId = "2758fd4a-3c72-4e08-8f30-c8ba9431a881";
const project = {
  id: projectId,
  name: "Research",
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-02T12:00:00.000Z",
  description: null,
  icon_type: "remixicon",
  icon_value: "ri-folder-line",
  icon_color: "blue",
} as Project;

let root: Root | undefined;
let queryClient: QueryClient | undefined;
let container: HTMLDivElement | undefined;

function createHarness(children: React.ReactNode) {
  return createElement(
    I18nProvider,
    { i18n },
    createElement(QueryClientProvider, { client: queryClient! }, children),
  );
}

function createDataTransfer(files: File[] = []) {
  const data = new Map<string, string>();
  const types: string[] = [];
  const transfer = {
    files: Object.assign(files, { length: files.length }),
    get types() { return types; },
    effectAllowed: "none",
    dropEffect: "none",
    setData(type: string, value: string) {
      if (!types.includes(type)) types.push(type);
      data.set(type, value);
    },
    getData(type: string) { return data.get(type) ?? ""; },
  } as unknown as DataTransfer;
  return transfer;
}

function dispatchDrag(target: Element, type: string, dataTransfer: DataTransfer, relatedTarget: Node | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    relatedTarget: { value: relatedTarget },
  });
  act(() => target.dispatchEvent(event));
  return event;
}

function projectRow() {
  const row = [...container!.querySelectorAll("button")].find(button => button.textContent?.includes(project.name));
  if (!row) throw new Error("Project row was not rendered");
  return row;
}

async function render(children: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createHarness(children));
    await Promise.resolve();
  });
}

async function flushMutations() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, refetchOnWindowFocus: false } },
  });
  testMocks.listProjects.mockResolvedValue([project]);
  testMocks.listSessionsByProject.mockResolvedValue([]);
  testMocks.assignSessionToProject.mockResolvedValue(null);
  testMocks.markAndEnqueueProjectBriefRefresh.mockResolvedValue(undefined);
  testMocks.sessionGetEvent.mockResolvedValue(null);
  testMocks.listSessions.mockResolvedValue([{
    id: noteId,
    user_id: "user-1",
    title: "Dragged note",
    created_at: "2026-10-01T12:00:00.000Z",
    visited_at: "2026-10-01T12:00:00.000Z",
    record_start: null,
    record_end: null,
    raw_memo_html: "",
    enhanced_memo_html: null,
    conversations: "[]",
    words: [],
    calendar_event_id: null,
    pre_meeting_memo_html: null,
    source_type: "manual",
    source_metadata: null,
    space_id: null,
    auto_enhanced_memo_html: null,
    needs_enhance: false,
  }]);
  testMocks.sessionState.current = {
    [noteId]: { getState: () => ({ refresh: vi.fn() }) },
  };
  testMocks.multiSelect.current = {
    isMultiSelectMode: false,
    selectedNoteIds: new Set<string>(),
    getSelectedCount: () => 0,
    clearSelection: testMocks.clearSelection,
    toggleNote: testMocks.toggleNote,
    isSelected: () => false,
  };
  queryClient.setQueryData(["projects"], [project]);
  queryClient.setQueryData(["event", noteId], null);
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(async () => {
  act(() => endNoteProjectDrag(noteId));
  if (root) await act(async () => root?.unmount());
  queryClient?.clear();
  vi.unstubAllGlobals();
  container?.remove();
  root = undefined;
  queryClient = undefined;
  container = undefined;
});

describe("sidebar note to project drag and drop", () => {
  it("highlights a valid project without assigning during hover, then adds the note on drop", async () => {
    testMocks.assignSessionToProject.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(null), 0)));
    await render(createElement(Fragment, null, createElement(NotesList, { filter: () => true }), createElement(ProjectsSection)));
    await flushMutations();
    await flushMutations();
    const noteTitle = [...container!.querySelectorAll("span")].find(span => span.textContent === "Dragged note");
    const projectButton = projectRow();
    const renderCount = testMocks.noteTitleRender.mock.calls.length;
    const projectsRequestCount = testMocks.listProjects.mock.calls.length;
    act(() => queryClient?.setQueryData(["projects"], [{ ...project, name: "Updated project" }]));
    await flushMutations();
    expect(testMocks.noteTitleRender).toHaveBeenCalledTimes(renderCount);
    expect(testMocks.listProjects).toHaveBeenCalledTimes(projectsRequestCount);
    const transfer = createDataTransfer();
    expect(noteTitle?.parentElement?.getAttribute("draggable")).toBe("true");
    dispatchDrag(noteTitle!.parentElement!, "dragstart", transfer);
    expect([...transfer.types]).toEqual([NOTE_PROJECT_DRAG_TYPE]);

    dispatchDrag(projectButton, "dragenter", transfer);
    expect(projectButton.className).toContain("ring-sidebar-ring");
    for (let index = 0; index < 5; index += 1) {
      const event = dispatchDrag(projectButton, "dragover", transfer);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(testMocks.assignSessionToProject).not.toHaveBeenCalled();
    expect(testMocks.listSessionsByProject).toHaveBeenCalledTimes(1);
    expect(testMocks.noteTitleRender).toHaveBeenCalledTimes(renderCount);
    expect(testMocks.noteRowMount).toHaveBeenCalledTimes(1);
    expect(noteTitle?.isConnected).toBe(true);

    dispatchDrag(projectButton, "drop", transfer);
    await flushMutations();
    expect(testMocks.assignSessionToProject).toHaveBeenCalledExactlyOnceWith(noteId, projectId);
    expect(testMocks.markAndEnqueueProjectBriefRefresh).toHaveBeenCalledExactlyOnceWith(projectId);
    expect(testMocks.trackEvent).toHaveBeenCalledWith("project_notes_added", "user-1", {
      project_id: projectId,
      note_count: 1,
      source: "sidebar_drag_drop",
    });
    expect(testMocks.noteRowUnmount).not.toHaveBeenCalled();
    expect(testMocks.navigate).not.toHaveBeenCalled();
  });

  it("ignores external text, files, and payload IDs that differ from the active note", async () => {
    await render(createElement(ProjectsSection));
    const projectButton = projectRow();
    const internalTransfer = createDataTransfer();
    startNoteProjectDrag(internalTransfer, noteId);
    internalTransfer.setData(NOTE_PROJECT_DRAG_TYPE, otherNoteId);
    dispatchDrag(projectButton, "dragover", internalTransfer);
    dispatchDrag(projectButton, "drop", internalTransfer);

    const externalText = createDataTransfer();
    externalText.setData("text/plain", noteId);
    dispatchDrag(projectButton, "dragover", externalText);
    dispatchDrag(projectButton, "drop", externalText);

    const externalFile = createDataTransfer([new File(["note"], "note.txt", { type: "text/plain" })]);
    externalFile.setData(NOTE_PROJECT_DRAG_TYPE, noteId);
    dispatchDrag(projectButton, "dragover", externalFile);
    dispatchDrag(projectButton, "drop", externalFile);

    expect(testMocks.assignSessionToProject).not.toHaveBeenCalled();
    expect(testMocks.markAndEnqueueProjectBriefRefresh).not.toHaveBeenCalled();
  });

  it("allows only one assignment for duplicate pending drops and clears the guard after failure", async () => {
    let rejectAssignment: ((error: Error) => void) | undefined;
    testMocks.assignSessionToProject.mockImplementationOnce(() => new Promise((_, reject) => { rejectAssignment = reject; }));
    testMocks.assignSessionToProject.mockResolvedValueOnce(null);
    await render(createElement(ProjectsSection));
    const projectButton = projectRow();
    const transfer = createDataTransfer();
    startNoteProjectDrag(transfer, noteId);

    expect([...transfer.types]).toEqual([NOTE_PROJECT_DRAG_TYPE]);
    dispatchDrag(projectButton, "dragover", transfer);
    dispatchDrag(projectButton, "drop", transfer);
    dispatchDrag(projectButton, "drop", transfer);
    await act(async () => { await Promise.resolve(); });
    expect(testMocks.assignSessionToProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectAssignment?.(new Error("write failed"));
      await Promise.resolve();
    });
    await flushMutations();
    expect(testMocks.toast).toHaveBeenCalled();

    const retryTransfer = createDataTransfer();
    startNoteProjectDrag(retryTransfer, noteId);
    dispatchDrag(projectButton, "drop", retryTransfer);
    await flushMutations();
    expect(testMocks.assignSessionToProject).toHaveBeenCalledTimes(2);
  });

  it("does not make note rows draggable when the project list is empty", async () => {
    queryClient?.setQueryData(["projects"], []);
    testMocks.listProjects.mockResolvedValue([]);
    await render(createElement(NotesList, { filter: () => true }));
    await flushMutations();

    const title = [...container!.querySelectorAll("span")].find(span => span.textContent === "Dragged note");
    const draggableTitle = title?.parentElement;
    expect(draggableTitle?.getAttribute("draggable")).toBe("false");
  });

  it("clears the project highlight when a drag is cancelled or an invalid drop arrives", async () => {
    await render(createElement(Fragment, null, createElement(NotesList, { filter: () => true }), createElement(ProjectsSection)));
    await flushMutations();
    const noteTitle = [...container!.querySelectorAll("span")].find(span => span.textContent === "Dragged note");
    const noteDragHandle = noteTitle?.parentElement;
    const projectButton = projectRow();
    const transfer = createDataTransfer();
    dispatchDrag(noteDragHandle!, "dragstart", transfer);
    dispatchDrag(projectButton, "dragenter", transfer);
    expect(projectButton.className).toContain("ring-sidebar-ring");
    dispatchDrag(noteDragHandle!, "dragend", transfer);
    expect(projectButton.className).not.toContain("ring-sidebar-ring");

    const secondTransfer = createDataTransfer();
    startNoteProjectDrag(secondTransfer, noteId);
    dispatchDrag(projectButton, "dragenter", secondTransfer);
    secondTransfer.setData("text/plain", "external text");
    dispatchDrag(projectButton, "drop", secondTransfer);
    expect(projectButton.className).not.toContain("ring-sidebar-ring");
    expect(testMocks.assignSessionToProject).not.toHaveBeenCalled();
  });

  it.each([
    ["Included", false],
    ["ExcludedFromBrief", true],
    ["NeedsReview", true],
  ] as const)("only skips a cached %s membership when it is already Included", async (status, shouldAssign) => {
    await render(createElement(ProjectsSection));
    queryClient?.setQueryData([projectQueryKeys.sources, projectId], [
      { project_id: projectId, session_id: noteId, status },
    ]);
    expect(queryClient?.getQueryData([projectQueryKeys.sources, projectId])).toEqual([
      { project_id: projectId, session_id: noteId, status },
    ]);
    const projectButton = projectRow();
    const transfer = createDataTransfer();
    startNoteProjectDrag(transfer, noteId);

    dispatchDrag(projectButton, "dragover", transfer);
    dispatchDrag(projectButton, "drop", transfer);
    await flushMutations();
    if (shouldAssign) {
      expect(testMocks.assignSessionToProject).toHaveBeenCalledExactlyOnceWith(noteId, projectId);
      expect(testMocks.markAndEnqueueProjectBriefRefresh).toHaveBeenCalledExactlyOnceWith(projectId);
    } else {
      expect(testMocks.assignSessionToProject).not.toHaveBeenCalled();
      expect(testMocks.markAndEnqueueProjectBriefRefresh).not.toHaveBeenCalled();
    }
  });

  it("preserves note navigation, checkbox selection, and the bulk project menu action", async () => {
    testMocks.multiSelect.current = {
      isMultiSelectMode: false,
      selectedNoteIds: new Set<string>(),
      getSelectedCount: () => 0,
      clearSelection: testMocks.clearSelection,
      toggleNote: testMocks.toggleNote,
      isSelected: () => false,
    };
    await render(createElement(NoteItem, {
      activeSessionId: "",
      currentSessionId: noteId,
      canDragToProject: false,
    }));
    const noteRow = container!.querySelector("[draggable]");
    expect(noteRow?.getAttribute("draggable")).toBe("false");
    const title = [...container!.querySelectorAll("span")].find(span => span.textContent === "Dragged note");
    act(() => title?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(testMocks.navigate).toHaveBeenCalledWith({ to: "/app/note/$id", params: { id: noteId } });
    act(() => container!.querySelector<HTMLButtonElement>('button[aria-label="Note actions"]')?.click());
    expect(testMocks.navigate).toHaveBeenCalledTimes(1);

    testMocks.navigate.mockClear();
    testMocks.multiSelect.current = {
      isMultiSelectMode: true,
      selectedNoteIds: new Set([noteId, otherNoteId]),
      getSelectedCount: () => 2,
      clearSelection: testMocks.clearSelection,
      toggleNote: testMocks.toggleNote,
      isSelected: () => false,
    };
    await act(async () => {
      root?.render(createHarness(createElement(NoteItem, {
        activeSessionId: "",
        currentSessionId: noteId,
        canDragToProject: true,
      })));
      await Promise.resolve();
    });
    expect(container!.querySelector("[draggable]")?.getAttribute("draggable")).toBe("false");
    const checkbox = container!.querySelector<HTMLButtonElement>('[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    act(() => checkbox?.click());
    expect(testMocks.toggleNote).toHaveBeenCalledWith(noteId);
    expect(testMocks.navigate).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(createHarness(createElement(BulkActionBar)));
      await Promise.resolve();
    });
    await flushMutations();
    expect(container!.innerHTML).toContain(project.name);
    expect([...container!.querySelectorAll("button")].some(button => button.textContent?.includes(project.name))).toBe(true);
    act(() => [...container!.querySelectorAll("button")].find(button => button.textContent?.includes(project.name))?.click());
    await flushMutations();
    expect(testMocks.assignSessionToProject).toHaveBeenCalledTimes(2);
    expect(testMocks.trackEvent).toHaveBeenCalledWith("project_notes_added", "user-1", {
      project_id: projectId,
      note_count: 2,
      source: "bulk_action",
    });
    expect(testMocks.clearSelection).toHaveBeenCalledTimes(1);
  });
});
