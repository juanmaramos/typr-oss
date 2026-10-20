// @vitest-environment jsdom
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { TranscriptEditorRef } from "@typr/tiptap/transcript";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptActionBar } from "./TranscriptActionBar";

const mocks = vi.hoisted(() => ({
  switchView: vi.fn(),
  writeText: vi.fn(async (_text: string) => {}),
  changing: false,
}));
vi.mock("@/contexts", () => ({ useRightPanel: () => ({ currentView: "transcript", switchView: mocks.switchView }) }));
vi.mock("@/hooks/useTranscriptionActive", () => ({ useTranscriptionActive: () => ({ isRecordingActive: false }) }));
vi.mock(
  "../hooks/useSTTModel",
  () => ({
    useSTTModel: () => ({ selectedLanguage: "balanced", handleLanguageChange: vi.fn(), isChanging: mocks.changing }),
  }),
);
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: mocks.writeText }));
vi.mock("./MicrophoneSelector", () => ({ MicrophoneSelector: () => <button>Audio input</button> }));
vi.mock(
  "./STTLanguageSelector",
  () => ({ STTLanguageSelector: ({ disabled }: { disabled: boolean }) => <button disabled={disabled}>Model</button> }),
);

let root: Root;
let container: HTMLDivElement;
let width = 600;
let observer: {
  callback: ResizeObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
};
const i18n = setupI18n({ locale: "en", messages: { en: english, es: spanish } });
const onSearch = vi.fn();
const onDock = vi.fn();
const onClose = vi.fn();
const editorRef = { current: { editor: {}, toText: () => "Final transcript" } as unknown as TranscriptEditorRef };
async function render(props: Partial<ComponentProps<typeof TranscriptActionBar>> = {}) {
  await act(async () =>
    root.render(
      <I18nProvider i18n={i18n}>
        <TranscriptActionBar
          sessionId="note"
          layout="floating"
          showTabs={false}
          transcriptState="stopped"
          isLanguageChangeable
          editorRef={editorRef}
          onSearchToggle={onSearch}
          onMoveToSidebar={onDock}
          onClose={onClose}
          {...props}
        />
      </I18nProvider>,
    )
  );
}
function button(title: string) {
  return container.querySelector<HTMLButtonElement>(`button[title="${title}"]`)!;
}
async function openMore() {
  await act(async () => {
    button("More transcript actions").focus();
    button("More transcript actions").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  width = 600;
  mocks.changing = false;
  vi.clearAllMocks();
  i18n.activate("en");
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    width,
    height: 40,
    top: 0,
    left: 0,
    bottom: 40,
    right: width,
    x: 0,
    y: 0,
    toJSON() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      callback: ResizeObserverCallback;
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        observer = this;
      }
      observe = vi.fn();
      unobserve() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("floating transcript action groups", () => {
  it("keeps audio setup, transcript actions, and window controls in order across states", async () => {
    await render();
    const dock = button("Move to sidebar"), minimize = button("Minimize");
    for (const transcriptState of ["empty", "active", "stopped"] as const) {
      await render({ transcriptState, isLanguageChangeable: false });
      expect([...container.querySelectorAll("[role=\"group\"]")].map(group => group.getAttribute("aria-label")))
        .toEqual(["Audio setup", "Transcript actions", "Window controls"]);
      expect(button("Move to sidebar")).toBe(dock);
      expect(button("Minimize")).toBe(minimize);
      expect((container.querySelector("[aria-label=\"Audio setup\"] button:last-child") as HTMLButtonElement).disabled)
        .toBe(transcriptState === "active");
    }
    await act(async () => {
      button("Ask AI").click();
      dock.click();
      minimize.click();
    });
    expect(mocks.switchView).toHaveBeenCalledWith("chat");
    expect(onDock).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("responds to panel resize without a window resize and keeps primary controls visible", async () => {
    await render();
    expect(button("Find & Replace")).not.toBeNull();
    expect(button("More transcript actions")).toBeNull();
    const toolbarObserver = observer;
    expect(toolbarObserver.observe).toHaveBeenCalledWith(container.firstElementChild);
    await act(async () =>
      toolbarObserver.callback([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver)
    );
    expect(button("Find & Replace")).toBeNull();
    expect(button("Copy All")).toBeNull();
    expect(button("More transcript actions")).not.toBeNull();
    expect(button("Ask AI")).not.toBeNull();
    expect(button("Move to sidebar")).not.toBeNull();
    expect(button("Minimize")).not.toBeNull();
    await act(async () =>
      toolbarObserver.callback([{ contentRect: { width: 600 } } as ResizeObserverEntry], {} as ResizeObserver)
    );
    expect(button("Find & Replace")).not.toBeNull();
    expect(button("More transcript actions")).toBeNull();
  });
  it("opens More with the keyboard and runs the same Find action", async () => {
    width = 320;
    await render();
    await openMore();
    const item = [...document.querySelectorAll<HTMLElement>("[role=\"menuitem\"]")].find(item =>
      item.textContent === "Find & Replace"
    )!;
    expect(item).toBeDefined();
    await act(async () => {
      item.focus();
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(onSearch).toHaveBeenCalledWith(true);
  });
  it("copies the transcript through More and dismisses the menu", async () => {
    width = 320;
    await render();
    await openMore();
    const item = [...document.querySelectorAll<HTMLElement>("[role=\"menuitem\"]")].find(item =>
      item.textContent === "Copy All"
    )!;
    await act(async () => item.click());
    expect(mocks.writeText).toHaveBeenCalledWith("Final transcript");
    expect(document.querySelector("[role=\"menu\"]")).toBeNull();
  });
  it("dismisses More with Escape and returns focus to its trigger", async () => {
    width = 320;
    await render();
    await openMore();
    const item = document.querySelector<HTMLElement>("[role=\"menuitem\"]")!;
    await act(async () => {
      item.focus();
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(document.querySelector("[role=\"menu\"]")).toBeNull();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(button("More transcript actions"));
    expect(onClose).not.toHaveBeenCalled();
  });
  it("localizes the overflow control and action groups in Spanish", async () => {
    width = 320;
    i18n.activate("es");
    await render();
    expect(button("Más acciones de transcripción")).not.toBeNull();
    expect(container.querySelector("[aria-label=\"Configuración de audio\"]")).not.toBeNull();
    expect(container.querySelector("[aria-label=\"Controles de ventana\"]")).not.toBeNull();
  });
  it("releases its panel observer and preserves sidebar actions", async () => {
    width = 320;
    await render({ layout: "sidebar", showTabs: true });
    expect(button("Find & Replace")).not.toBeNull();
    expect(button("More transcript actions")).toBeNull();
    const disconnect = observer.disconnect;
    await render({ isSearchActive: true });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
