// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const align = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@typr/plugin-windows", () => ({ commands: { windowAlignTitlebarControls: align } }));
import { useTitlebarAlignment } from "./useTitlebarAlignment";

let root: Root;
let container: HTMLDivElement;
let mounted: boolean;
let bounds = { top: 6, height: 40 };
let resized: ResizeObserverCallback;
const disconnect = vi.fn();
function Chrome({ enabled = true }: { enabled?: boolean }) {
  const ref = useTitlebarAlignment(enabled);
  return <div ref={ref} />;
}

const render = (enabled = true) => act(() => root.render(<Chrome enabled={enabled} />));
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  mounted = true;
  bounds = { top: 6, height: 40 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => bounds as DOMRect);
  vi.stubGlobal("innerHeight", 600);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  align.mockReset().mockResolvedValue(null);
  disconnect.mockClear();
});
afterEach(() => {
  if (mounted) {
    act(() => root.unmount());
  }
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native titlebar alignment", () => {
  it("uses the rendered row center and follows changes without duplicate IPC", () => {
    render();
    expect(align).toHaveBeenLastCalledWith(26, 600);
    act(() => resized([], {} as ResizeObserver));
    expect(align).toHaveBeenCalledTimes(1);
    bounds = { top: 6, height: 44 };
    act(() => resized([], {} as ResizeObserver));
    expect(align).toHaveBeenLastCalledWith(28, 600);
    vi.stubGlobal("innerHeight", 800);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(align).toHaveBeenLastCalledWith(28, 800);
  });

  it("starts only when macOS is resolved and cleans up on unmount", () => {
    render(false);
    expect(align).not.toHaveBeenCalled();
    render();
    expect(align).toHaveBeenCalledOnce();
    act(() => root.unmount());
    mounted = false;
    expect(disconnect).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("resize")));
    expect(align).toHaveBeenCalledOnce();
  });

  it("does not send hidden or outside-viewport references", () => {
    bounds = { top: 6, height: 0 };
    render();
    bounds = { top: 700, height: 40 };
    act(() => resized([], {} as ResizeObserver));
    expect(align).not.toHaveBeenCalled();
    bounds = { top: 6, height: 40 };
    act(() => resized([], {} as ResizeObserver));
    expect(align).toHaveBeenLastCalledWith(26, 600);
  });
});
