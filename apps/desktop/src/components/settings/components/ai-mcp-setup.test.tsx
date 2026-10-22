// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiMcpSetup } from "./ai-mcp-setup";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("AI MCP setup and local check", () => {
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    notifyManager.setNotifyFunction(callback => callback());
    vi.restoreAllMocks();
  });

  async function renderSetup() {
    vi.mocked(invoke).mockResolvedValue({ claude_json: '{"mcpServers":{}}', codex_toml: '[mcp_servers.typr_local]\ncommand = "/fixture/typr-mcp"' });
    await act(async () => root.render(
      <I18nProvider i18n={i18n}><QueryClientProvider client={client}><AiMcpSetup /></QueryClientProvider></I18nProvider>,
    ));
    await vi.waitFor(() => expect(container.textContent).toContain('/fixture/typr-mcp'));
  }

  it("copies native configuration without writing client settings", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderSetup();
    const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Copy Codex configuration")!;
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith('[mcp_servers.typr_local]\ncommand = "/fixture/typr-mcp"');
    expect(container.textContent).toContain("Configuration copied.");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("get_ai_mcp_setup");
    expect(container.textContent).toContain("does not confirm that your AI client has loaded Typr");
  });

  it("only reports a successful local check after native verification and supports retry", async () => {
    await renderSetup();
    const button = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Check local server")!;
    vi.mocked(invoke).mockRejectedValueOnce("MCP_CHECK_FAILED");
    await act(async () => button.click());
    await vi.waitFor(() => expect(container.textContent).toContain("Local MCP check failed."));
    expect(container.textContent).not.toContain("database read passed.");
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await act(async () => button.click());
    await vi.waitFor(() => expect(container.textContent).toContain("database read passed."));
    expect(container.textContent).not.toContain("Local MCP check failed.");
    expect(invoke).toHaveBeenLastCalledWith("check_ai_mcp_connection");
  });
});
