// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use the workspace's installed editor, including its real transaction subscriptions and BubbleMenu.
import { Editor } from "../../../../../packages/tiptap/node_modules/@tiptap/core";
import { getExtensions } from "../../../../../packages/tiptap/src/shared/extensions";
import { useChatState } from "@/stores/useChatState";
import { messages as en } from "../../locales/en/messages.po";
import { messages as es } from "../../locales/es/messages.po";
import { SelectionActions } from "./selection-actions";

vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: null }) }));
vi.mock("@typr/plugin-analytics", () => ({ commands: { event: vi.fn() } }));
vi.mock("@/components/shortcut-by-id", () => ({ ShortcutById: () => null }));

let editor: Editor;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const improve = vi.fn();
const highlight = vi.fn();
const i18n = setupI18n({ locale: "en", messages: { en, es } });

async function render(aiEnabled = false) {
  await act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <SelectionActions editor={editor} sessionId="selection-test" isAgentWritingEnabled={aiEnabled} onImproveWriting={improve} />
      </I18nProvider>,
    );
  });
}

function button(label: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((element) => element.getAttribute("aria-label") === label || element.textContent === label);
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

async function click(label: string) {
  await act(async () => button(label).click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

async function selectText(from = 1, to = 6) {
  await act(async () => {
    editor.commands.setTextSelection({ from, to });
    editor.view.focus();
    editor.commands.setTextSelection({ from, to });
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

async function changeUrl(value: string) {
  const input = document.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function chooseStyle(label: string) {
  const trigger = document.querySelector<HTMLButtonElement>("[role=combobox]")!;
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  const option = [...document.querySelectorAll<HTMLElement>("[role=option]")].find((item) => item.textContent === label)!;
  expect(option).toBeDefined();
  await act(async () => {
    option.focus();
    option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

beforeEach(() => {
  i18n.activate("en");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect(100, 100, 100, 20) });
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  host = document.createElement("div");
  const editorHost = document.createElement("div");
  host.append(editorHost);
  document.body.append(host);
  editor = new Editor({ element: editorHost, extensions: getExtensions().map((extension) => extension.name === "aiHighlight"
    ? extension.extend({
      // The toolbar delegates persistent highlighting to this existing extension.
      addCommands: () => ({ setAISelection: (range?: { from: number; to: number }) => () => { highlight(range); return true; } }),
    })
    : extension), content: "<p>Hello world</p>" });
  root = createRoot(host.appendChild(document.createElement("div")));
  improve.mockClear();
  highlight.mockClear();
  useChatState.getState().clearSession("selection-test");
});

afterEach(async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  await act(async () => root.unmount());
  editor.destroy();
  host.remove();
  vi.restoreAllMocks();
});

describe("contextual selection actions", () => {
  it("formats without AI, updates pressed state on transactions, preserves the range and supports undo", async () => {
    await render();
    await selectText();
    expect(document.querySelector("[data-tippy-root]")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Add to Chat");
    await click("Bold");
    expect(editor.getHTML()).toBe("<p><strong>Hello</strong> world</p>");
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    expect(button("Bold").getAttribute("aria-pressed")).toBe("true");
    await click("Italic");
    expect(editor.isActive("italic")).toBe(true);
    expect(button("Italic").getAttribute("aria-pressed")).toBe("true");
    await act(async () => { editor.commands.undo(); });
    expect(editor.getHTML()).toBe("<p><strong>Hello</strong> world</p>");
    await act(async () => { editor.commands.undo(); });
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
    expect(button("Bold").getAttribute("aria-pressed")).toBe("false");
    expect(button("Italic").getAttribute("aria-pressed")).toBe("false");
  });

  it("retains the selected text through the link portal, rejects unsafe schemes, and edits/removes a link", async () => {
    await render();
    await selectText();
    await click("Link");
    expect(document.activeElement?.tagName).toBe("INPUT");
    for (const url of ["javascript:alert(1)", "file:///tmp/private", "mailto:user@example.com", "ftp://example.com"]) {
      await changeUrl(url);
      await click("Apply link");
      expect(document.querySelector("[role=alert]")?.textContent).toContain("HTTP or HTTPS");
      expect(editor.getHTML()).toBe("<p>Hello world</p>");
    }
    await changeUrl("example.com/path");
    await click("Apply link");
    expect(editor.getAttributes("link").href).toBe("https://example.com/path");
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    await click("Edit link");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("https://example.com/path");
    await changeUrl("https://example.org/updated");
    await click("Apply link");
    expect(editor.getAttributes("link").href).toBe("https://example.org/updated");
    await click("Edit link");
    await click("Remove link");
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
  });

  it("switches all requested block styles while preserving text and updates the selector", async () => {
    await render();
    await selectText();
    for (const [label, type] of [["Heading 2", "heading"], ["Heading 3", "heading"], ["Bulleted list", "bulletList"], ["Numbered list", "orderedList"], ["Paragraph", "paragraph"]]) {
      await chooseStyle(label);
      expect(editor.isActive(type)).toBe(true);
      expect(editor.state.doc.textContent).toBe("Hello world");
      expect(document.querySelector("[role=combobox]")?.textContent).toBe(label);
    }
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
  });

  it("gates AI buttons and shortcuts, preserves chat/edit actions, and scopes shortcuts to the editor", async () => {
    const add = vi.fn();
    window.addEventListener("editInChatRequested", add);
    await render();
    await selectText();
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "l", code: "KeyL", ctrlKey: true, bubbles: true }));
    });
    expect(add).not.toHaveBeenCalled();
    await render(true);
    await click("Add to Chat");
    expect(add).toHaveBeenCalledTimes(1);
    expect(highlight).toHaveBeenCalledWith({ from: 1, to: 6 });
    await act(async () => useChatState.getState().setEditMode("selection-test", "edit"));
    await selectText(2, 6);
    await selectText();
    expect(button("Edit in Chat")).toBeDefined();
    // AI actions remain usable after keyboard focus moves into the toolbar.
    button("Improve writing").focus();
    await click("Improve writing");
    expect(improve).toHaveBeenCalledWith("Hello", { from: 1, to: 6 });
    window.removeEventListener("editInChatRequested", add);
  });

  it("runs AI shortcuts only when enabled and focused in the editable editor", async () => {
    const add = vi.fn();
    window.addEventListener("editInChatRequested", add);
    const shortcut = async (target: Element, key: string, code: string, shiftKey = false) => {
      await act(async () => {
        target.dispatchEvent(new KeyboardEvent("keydown", { key, code, ctrlKey: true, shiftKey, bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keyup", { key, code, ctrlKey: true, shiftKey, bubbles: true }));
      });
    };
    await render(true);
    await selectText();
    await shortcut(editor.view.dom, "l", "KeyL");
    expect(add).toHaveBeenCalledTimes(1);
    const input = host.appendChild(document.createElement("input"));
    input.focus();
    await shortcut(input, "l", "KeyL");
    expect(add).toHaveBeenCalledTimes(1);
    await act(async () => useChatState.getState().setEditMode("selection-test", "edit"));
    await selectText(2, 6);
    await shortcut(editor.view.dom, "i", "KeyI", true);
    expect(improve).toHaveBeenCalledWith("ello", { from: 2, to: 6 });
    improve.mockClear();
    await render(false);
    await selectText();
    await shortcut(editor.view.dom, "l", "KeyL");
    await shortcut(editor.view.dom, "i", "KeyI", true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(improve).not.toHaveBeenCalled();
    window.removeEventListener("editInChatRequested", add);
  });

  it("supports keyboard access, Escape, and selection retention when the link form is dismissed", async () => {
    await render();
    await selectText();
    await act(async () => {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", altKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(button("Bold"));
    await click("Link");
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(document.querySelector("input")).toBeNull();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    await selectText(2, 6);
    await click("Bold");
    expect(editor.getHTML()).toBe("<p>H<strong>ello</strong> world</p>");
  });

  it("updates the toolbar and link form in Spanish", async () => {
    await render();
    await selectText();
    await act(async () => i18n.activate("es"));
    expect(button("Negrita")).toBeDefined();
    expect(button("Cursiva")).toBeDefined();
    expect(document.querySelector("[role=combobox]")?.textContent).toBe("Párrafo");
    await click("Enlace");
    expect(document.querySelector("label")?.textContent).toBe("URL del enlace");
    expect(button("Aplicar enlace")).toBeDefined();
  });

  it("hides for empty selections and read-only editors and prevents read-only mutations", async () => {
    await render();
    await selectText();
    await act(async () => editor.commands.setTextSelection(1));
    expect(document.querySelector<HTMLElement>("[data-tippy-root]")?.style.visibility).not.toBe("visible");
    await selectText();
    const trigger = document.querySelector<HTMLButtonElement>("[role=combobox]")!;
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(document.querySelector("[role=listbox]")).not.toBeNull();
    await act(async () => editor.setEditable(false));
    expect(document.querySelector("[role=listbox]")).toBeNull();
    expect(document.querySelector<HTMLElement>("[data-tippy-root]")?.style.visibility).not.toBe("visible");
    expect(editor.getHTML()).toBe("<p>Hello world</p>");
    await act(async () => editor.commands.setTextSelection({ from: 2, to: 6 }));
    expect(document.querySelector<HTMLElement>("[data-tippy-root]")?.style.visibility).not.toBe("visible");
  });
});
