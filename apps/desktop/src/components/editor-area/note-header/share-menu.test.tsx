// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Session } from "@typr/plugin-db";
import { toast } from "@typr/ui/components/ui/toast";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareMenu } from "./share-menu";

const mocks = vi.hoisted(() => ({ openDialog: vi.fn() }));
vi.mock("@/contexts/settings-dialog", () => ({ useSettingsDialog: () => mocks }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openPath: vi.fn(), openUrl: vi.fn() }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("../../toolbar/utils/pdf-export", () => ({ exportToPDF: vi.fn() }));
vi.mock("../../toolbar/utils/share-session", () => ({ buildEmailShareUrl: vi.fn(), copyAiSummaryToClipboard: vi.fn() }));

const session = (id: string): Session => ({
  id,
  created_at: "2026-10-20T12:00:00Z",
  visited_at: "2026-10-20T12:00:00Z",
  user_id: "test-user",
  calendar_event_id: null,
  title: "Private meeting title",
  raw_memo_html: "Private notes body",
  enhanced_memo_html: null,
  auto_enhanced_memo_html: null,
  words: [{ text: "Private transcript", speaker: null, confidence: null, start_ms: null, end_ms: null }],
  record_start: null,
  record_end: null,
  pre_meeting_memo_html: null,
  source_type: null,
  source_metadata: null,
  space_id: null,
  needs_enhance: false,
});

describe("Ask Claude Desktop in Share", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  const i18n = setupI18n({ locale: "en", messages: { en: {} } });

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    notifyManager.setNotifyFunction(callback => act(() => callback()));
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.mocked(invoke).mockResolvedValue(false);
    vi.mocked(openUrl).mockResolvedValue();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    notifyManager.setNotifyFunction(callback => callback());
    vi.restoreAllMocks();
  });

  async function render(id = "note-a") {
    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <ShareMenu session={session(id)} />
        </QueryClientProvider>
      </I18nProvider>,
    ));
  }

  async function press(element: Element, key: string) {
    await act(async () => {
      element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  async function selectClaude() {
    await act(async () => {
      (claudeItem() as HTMLElement).click();
    });
  }

  async function openMenu() {
    await press(container.querySelector("button")!, "ArrowDown");
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
  }

  function claudeItem() {
    return [...document.querySelectorAll('[role="menuitem"]')]
      .find(item => item.textContent === "Ask Claude Desktop")!;
  }

  function settingsItem() {
    return document.querySelector('[aria-label="Configure Claude Desktop integration"]');
  }

  it("loads status on opening, disables Ask while loading or failed, and keeps settings independent", async () => {
    let rejectStatus!: (reason: Error) => void;
    vi.mocked(invoke).mockReturnValue(new Promise((_resolve, reject) => { rejectStatus = reject; }));
    await render();
    expect(invoke).not.toHaveBeenCalled();
    await openMenu();
    expect(claudeItem().getAttribute("aria-disabled")).toBe("true");
    expect(settingsItem()).not.toBeNull();
    expect(claudeItem().contains(settingsItem())).toBe(false);
    expect(settingsItem()?.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => rejectStatus(new Error("Cannot read configuration")));
    await vi.waitFor(() => expect(client.getQueryState(["claude-mcp-status"])?.status).toBe("error"));
    await vi.waitFor(() => expect(claudeItem().getAttribute("aria-disabled")).toBe("true"));
    expect(settingsItem()).not.toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("lets keyboard users open Integrations beside the disabled action", async () => {
    await render();
    await openMenu();
    await vi.waitFor(() => expect(document.activeElement).toBe(settingsItem()));
    await press(settingsItem()!, "Enter");
    expect(mocks.openDialog).toHaveBeenCalledExactlyOnceWith("integrations");
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("opens a user-reviewed prompt for the current session ID without sending note content", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    await render();
    await openMenu();
    await vi.waitFor(() => expect(claudeItem().getAttribute("aria-disabled")).not.toBe("true"));
    expect(settingsItem()).toBeNull();
    await selectClaude();
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
    await render('note-b&injected=value#fragment');
    await openMenu();
    await vi.waitFor(() => expect(claudeItem().getAttribute("aria-disabled")).not.toBe("true"));
    await selectClaude();
    await vi.waitFor(() => expect(openUrl).toHaveBeenCalledTimes(2));
    const url = new URL(vi.mocked(openUrl).mock.calls[1][0]);
    expect(url.protocol).toBe("claude:");
    expect(url.hostname).toBe("claude.ai");
    expect(url.pathname).toBe("/new");
    expect([...url.searchParams.keys()]).toEqual(["q"]);
    const prompt = url.searchParams.get("q")!;
    expect(prompt).toContain('get_session using id "note-b&injected=value#fragment"');
    expect(prompt).toContain('connector named exactly "Typr Local"');
    expect(prompt).toContain("get_transcript from the same connector with the same id");
    expect(prompt).toContain("If the session is unavailable, stop and ask me to reconnect Typr Local in Integrations.");
    expect(prompt).not.toContain("note-a");
    expect(prompt).not.toContain("Private");
  });

  it("rechecks configuration when reopened instead of using stale configured state", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true).mockResolvedValue(false);
    await render();
    await openMenu();
    await vi.waitFor(() => expect(claudeItem().getAttribute("aria-disabled")).not.toBe("true"));
    await press(claudeItem(), "Escape");
    await openMenu();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(settingsItem()).not.toBeNull());
    expect(claudeItem().getAttribute("aria-disabled")).toBe("true");
  });

  it("reports a launch failure with a recoverable toast", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    vi.mocked(openUrl).mockRejectedValue(new Error("No handler for scheme"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render();
    await openMenu();
    await vi.waitFor(() => expect(claudeItem().getAttribute("aria-disabled")).not.toBe("true"));
    await selectClaude();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not open Claude Desktop",
      content: "Make sure Claude Desktop is installed, then try again.",
    })));
    expect(message).not.toHaveBeenCalled();
  });
});
