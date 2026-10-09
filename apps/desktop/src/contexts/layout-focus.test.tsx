// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LayoutProvider, useRightPanel } from "./layout";

const mockedLocation = vi.hoisted(() => ({ value: { pathname: "/app" } }));

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => mockedLocation.value,
}));
vi.mock("@/hooks/use-responsive", () => ({ useResponsive: () => ({ isMobile: false }) }));
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));

let panel: ReturnType<typeof useRightPanel> | undefined;
function PanelHarness({ showInput = false }: { showInput?: boolean }) {
  panel = useRightPanel();
  return showInput ? createElement("textarea", { ref: panel.chatInputRef }) : null;
}

describe("layout chat input focus lifecycle", () => {
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mockedLocation.value = { pathname: "/app" };
    panel = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    vi.useRealTimers();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("coalesces repeated requests and cancels on collapse and provider unmount", async () => {
    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness)));
    });

    act(() => {
      panel?.openFloating();
      panel?.openFloating();
      panel?.openFloating();
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => panel?.collapseFloating());
    expect(vi.getTimerCount()).toBe(0);

    act(() => panel?.openFloating());
    act(() => panel?.closeFloating());
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      panel?.openFloating();
      panel?.closeFloating();
    });
    expect(vi.getTimerCount()).toBe(0);

    act(() => panel?.openFloating());
    expect(vi.getTimerCount()).toBe(1);

    act(() => panel?.openFloating("chat", { focus: false }));
    expect(vi.getTimerCount()).toBe(0);

    act(() => panel?.openFloating());
    await act(async () => root?.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(5000));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("focuses a delayed input and keeps focus through a sidebar chat handoff", async () => {
    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness)));
    });
    act(() => panel?.openFloating());
    act(() => vi.advanceTimersByTime(150));
    expect(container?.querySelector("textarea")).toBeNull();

    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness, { showInput: true })));
    });
    const input = container?.querySelector("textarea");
    expect(input).not.toBeNull();
    const focus = vi.spyOn(input!, "focus");

    act(() => vi.advanceTimersByTime(50));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);

    act(() => panel?.showSidebar("chat"));
    act(() => vi.advanceTimersByTime(349));
    expect(focus).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1));
    expect(focus).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(input);
  });

  it("stops retrying after the bounded wait when no input appears", async () => {
    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness)));
    });

    act(() => {
      panel?.openFloating();
      panel?.openFloating();
      panel?.openFloating();
    });
    act(() => vi.advanceTimersByTime(150 + 10 * 50));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels focus retries on view changes and navigation", async () => {
    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness)));
    });

    act(() => panel?.openFloating());
    expect(vi.getTimerCount()).toBe(1);

    act(() => panel?.showSidebar("chat"));
    expect(vi.getTimerCount()).toBe(1);

    act(() => panel?.showFloatingDock("chat"));
    expect(vi.getTimerCount()).toBe(0);

    act(() => panel?.openFloating());
    expect(vi.getTimerCount()).toBe(1);

    act(() => panel?.switchView("transcript"));
    expect(vi.getTimerCount()).toBe(0);

    act(() => panel?.switchView("chat"));
    expect(vi.getTimerCount()).toBe(1);
    mockedLocation.value = { pathname: "/app/next" };

    await act(async () => {
      root?.render(createElement(LayoutProvider, null, createElement(PanelHarness)));
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
