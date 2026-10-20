// @vitest-environment jsdom
import { messages } from "@/locales/en/messages.po";
import { messages as spanishMessages } from "@/locales/es/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { Word } from "@typr/plugin-db";
import TranscriptEditor, { type TranscriptEditorRef } from "@typr/tiptap/transcript";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import tailwindcss from "tailwindcss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { typography } from "../../../../../../packages/ui/src/lib/typography";
import uiConfig from "../../../../../../packages/ui/tailwind.config";

let root: Root;
let container: HTMLDivElement;
let ref: ReturnType<typeof createRef<TranscriptEditorRef>>;
const onUpdate = vi.fn();
const word = (text: string, index = 0): Word => ({
  text,
  speaker: { type: "unassigned", value: { index } },
  start_ms: null,
  end_ms: null,
  confidence: null,
});

async function render(previews: Record<string, Word[]> = {}, editable = false) {
  await act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <TranscriptEditor
          ref={ref}
          initialWords={[word("Committed")]}
          previews={previews}
          editable={editable}
          onUpdate={onUpdate}
        />
      </I18nProvider>,
    );
  });
  await vi.waitFor(() => expect(ref.current?.editor).toBeTruthy());
}
async function setWords(words: Word[]) {
  await act(async () => ref.current?.setWords(words));
}
const preview = (channel: string) => container.querySelector<HTMLElement>(`[data-transcript-preview="${channel}"]`);

let stylesheet: HTMLStyleElement;
beforeAll(async () => {
  const transcriptCss = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../packages/tiptap/src/styles/transcript.css"),
    "utf8",
  );
  const result = await postcss([tailwindcss({ presets: [uiConfig], content: [{ raw: "" }] })]).process(transcriptCss, {
    from: undefined,
  });
  stylesheet = document.createElement("style");
  stylesheet.textContent = result.css;
  document.head.append(stylesheet);
});
afterAll(() => stylesheet.remove());

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  i18n.load("en", messages);
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  ref = createRef();
  onUpdate.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("inline interim transcript presentation", () => {
  it("revises the existing speaker paragraph then replaces interim words with the final, without persisting or exporting hypotheses", async () => {
    await render();
    const original = ref.current!.editor!.getJSON();
    await render({ mic: [word("preliminary")] });
    expect(preview("mic")?.tagName).toBe("SPAN");
    expect(preview("mic")?.closest(".transcript-speaker")?.textContent).toContain("Committed preliminary");
    expect(ref.current!.editor!.getJSON()).toEqual(original);
    expect(ref.current!.editor!.getHTML()).not.toContain("preliminary");
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed"]);
    expect(ref.current!.toText()).not.toContain("preliminary");
    await render({ mic: [word("revised")] });
    expect(container.textContent).not.toContain("preliminary");
    expect(preview("mic")?.textContent).toBe(" revised");
    await render({});
    await setWords([word("Committed"), word("final")]);
    expect(preview("mic")).toBeNull();
    expect(container.textContent?.match(/final/g)).toHaveLength(1);
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed", "final"]);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("keeps simultaneous sources in the same editor flow and clears only the finalized channel", async () => {
    await render({ mic: [word("hello")], speaker: [word("hola", 1)] });
    expect(preview("mic")?.tagName).toBe("SPAN");
    expect(preview("speaker")?.tagName).toBe("DIV");
    expect(preview("speaker")?.textContent).toBe("Themhola");
    expect(preview("speaker")?.parentElement?.classList.contains("tiptap-transcript")).toBe(true);
    await render({ speaker: [word("hola", 1)] });
    await setWords([word("Committed"), word("hello")]);
    expect(preview("mic")).toBeNull();
    expect(preview("speaker")?.textContent).toBe("Themhola");
    await render({}, true);
    expect(container.querySelector("[data-transcript-preview]")).toBeNull();
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed", "hello"]);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rebuilds an unchanged channel's widget when another speaker's final changes its placement", async () => {
    const mic = { mic: [word("pending")] };
    await render(mic);
    expect(preview("mic")?.tagName).toBe("SPAN");
    await setWords([word("Committed"), word("Hola", 1)]);
    expect(preview("mic")?.tagName).toBe("DIV");
    expect(preview("mic")?.textContent).toBe("Youpending");
    await setWords([word("Committed"), word("Hola", 1), word("Final", 0)]);
    expect(preview("mic")?.tagName).toBe("SPAN");
    expect(preview("mic")?.textContent).toBe(" pending");
  });

  it("keeps interim revisions outside edit history and never restores them through undo or redo", async () => {
    await render({}, true);
    const editor = ref.current!.editor!;
    await act(async () => editor.commands.insertContentAt(editor.state.doc.content.size - 1, " user"));
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed", "user"]);
    await render({ mic: [word("interim")] });
    await render({ mic: [word("revised interim")] });
    await render({}, true);
    await act(async () => editor.commands.undo());
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed"]);
    expect(editor.getHTML()).not.toContain("interim");
    await act(async () => editor.commands.redo());
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed", "user"]);
    expect(ref.current!.toText()).not.toContain("interim");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("refreshes a cached speaker label after a locale change without changing the hypothesis", async () => {
    const previews = { speaker: [word("Hola", 1)] };
    i18n.load("es", spanishMessages);
    await render(previews);
    expect(preview("speaker")?.textContent).toBe("ThemHola");
    await act(async () => i18n.activate("es"));
    expect(preview("speaker")?.textContent).toBe("OtrosHola");
    expect(ref.current!.getWords()?.map(word => word.text)).toEqual(["Committed"]);
  });

  it("renders the first hypothesis in an empty transcript and treats recognized text as text", async () => {
    await render();
    await setWords([]);
    await render({ mic: [word("<img src=x onerror=alert(1)>")] });
    expect(preview("mic")?.textContent).toBe("You<img src=x onerror=alert(1)>");
    expect(preview("mic")?.querySelector("img")).toBeNull();
    expect(container.querySelector(".transcript-preview-empty")).not.toBeNull();
    expect(ref.current!.getWords()).toEqual([]);
    expect(ref.current!.toText()).toBe("");
    await render({});
    expect(container.querySelector(".transcript-preview-empty")).toBeNull();
  });

  it.each(["en", "es"])(
    "uses one speaker layout and generated typography for preliminary and final text in %s",
    async (locale) => {
      i18n.load("es", spanishMessages);
      await act(async () => i18n.activate(locale));
      const cases: { speaker: Word["speaker"]; label: string }[] = [
        { speaker: { type: "unassigned", value: { index: 0 } }, label: locale === "en" ? "You" : "Tú" },
        { speaker: { type: "unassigned", value: { index: 1 } }, label: locale === "en" ? "Them" : "Otros" },
        { speaker: { type: "assigned", value: { id: "you", label: "" } }, label: locale === "en" ? "You" : "Tú" },
        { speaker: { type: "assigned", value: { id: "person", label: "Dr Ramos" } }, label: "Dr Ramos" },
        { speaker: null, label: "" },
      ];
      const metrics = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return {
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          display: style.display,
          marginBottom: style.marginBottom,
        };
      };
      await render();
      for (const scenario of cases) {
        await setWords([]);
        const spoken = { ...word("Spoken words"), speaker: scenario.speaker };
        await render({ mic: [spoken] });
        const preliminary = preview("mic")!;
        const provisionalLabel = preliminary.querySelector<HTMLElement>(".transcript-speaker-label");
        const provisionalBody = preliminary.querySelector<HTMLElement>(".transcript-speaker-content")!;
        expect(provisionalLabel?.textContent ?? "").toBe(scenario.label);
        const labelMetrics = provisionalLabel ? metrics(provisionalLabel) : null;
        const bodyMetrics = metrics(provisionalBody);
        expect(bodyMetrics).toMatchObject({
          fontSize: typography.fontSize["ui-control"],
          fontWeight: typography.fontWeight.normal,
          lineHeight: "1.5rem",
          display: "block",
        });
        if (provisionalLabel) {
          expect(labelMetrics).toMatchObject({
            fontSize: typography.fontSize["ui-label"],
            fontWeight: typography.fontWeight.medium,
            lineHeight: "1rem",
            display: "block",
          });
          expect(provisionalLabel.nextElementSibling).toBe(provisionalBody);
        }
        await render({});
        await setWords([spoken]);
        const final = container.querySelector<HTMLElement>(".transcript-speaker")!;
        const finalLabel = final.querySelector<HTMLElement>(".transcript-speaker-label");
        const finalBody = final.querySelector<HTMLElement>(".transcript-speaker-content")!;
        expect(finalLabel?.textContent ?? "").toBe(scenario.label);
        expect(metrics(finalBody)).toEqual(bodyMetrics);
        expect(finalLabel ? metrics(finalLabel) : null).toEqual(labelMetrics);
        if (finalLabel) {
          expect(finalLabel.nextElementSibling).toBe(finalBody);
        }
        const exportLabel = scenario.label || (locale === "en" ? "Them" : "Otros");
        expect(ref.current!.toText()).toBe(`[${exportLabel}]\nSpoken words`);
      }
      expect(onUpdate).not.toHaveBeenCalled();
    },
  );

  it("follows preview and final growth only while reading the transcript tail", async () => {
    await render();
    const scroll = container.querySelector<HTMLElement>(".overflow-y-auto")!;
    let height = 500;
    Object.defineProperty(scroll, "scrollHeight", { get: () => height });
    Object.defineProperty(scroll, "clientHeight", { value: 100 });
    scroll.scrollTop = 400;
    await render({ mic: [word("tail")] });
    expect(scroll.scrollTop).toBe(500);
    height = 700;
    scroll.scrollTop = 100;
    await render({ mic: [word("longer tail")] });
    expect(scroll.scrollTop).toBe(100);
    await setWords([word("Committed"), word("final")]);
    expect(scroll.scrollTop).toBe(100);
    scroll.scrollTop = 600;
    await setWords([word("Committed"), word("final"), word("tail")]);
    expect(scroll.scrollTop).toBe(700);
  });
});
