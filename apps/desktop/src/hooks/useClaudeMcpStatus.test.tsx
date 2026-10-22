// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "@typr/ui/components/ui/toast";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Integrations from "@/components/settings/views/integrations";
import { claudeMcpStatusQueryKey, useClaudeMcpStatus } from "./useClaudeMcpStatus";

vi.mock("@/components/settings/components/ai-mcp-setup", () => ({ AiMcpSetup: () => null }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "test-user" }) }));
vi.mock("@typr/plugin-analytics", () => ({ commands: { event: vi.fn() } }));
vi.mock("@/components/settings/components/data-path-block", () => ({ DataPathBlock: () => null }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: vi.fn() }));

function StatusObserver() {
  const status = useClaudeMcpStatus();
  return <output>{status.isError ? "error" : status.isPending ? "loading" : String(status.data)}</output>;
}

describe("Claude MCP configuration status", () => {
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

  async function renderSettings() {
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n}>
          <QueryClientProvider client={client}>
            <Integrations />
            <StatusObserver />
          </QueryClientProvider>
        </I18nProvider>,
      )
    );
  }

  function claudeButton() {
    return container.querySelector("button")!;
  }

  it("keeps Connect disabled until the initial check finishes and preserves check errors", async () => {
    let rejectStatus!: (reason: Error) => void;
    vi.mocked(invoke).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectStatus = reject;
      }),
    );
    await renderSettings();
    expect(claudeButton().disabled).toBe(true);
    expect(container.querySelector("output")?.textContent).toBe("loading");
    await act(async () => rejectStatus(new Error("Invalid local configuration")));
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("error"));
    expect(container.textContent).toContain("Could not check Claude Desktop configuration.");
    expect(client.getQueryState(claudeMcpStatusQueryKey)?.status).toBe("error");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("refreshes every status observer after setup and disconnect without claiming a live connection", async () => {
    let configured = false;
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "check_claude_mcp_status") {
        return configured;
      }
      if (command === "setup_claude_mcp") {
        configured = true;
      }
      if (command === "remove_claude_mcp") {
        configured = false;
      }
      return "Native success";
    });
    await renderSettings();
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("false"));
    await act(async () => claudeButton().click());
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("true"));
    expect(container.textContent).toContain("Configured");
    expect(container.textContent).not.toContain("Connected");
    expect(claudeButton().textContent).toBe("Disconnect");
    await act(async () => claudeButton().click());
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("false"));
    expect(container.textContent).not.toContain("Configured");
    expect(invoke).toHaveBeenCalledWith("setup_claude_mcp");
    expect(invoke).toHaveBeenCalledWith("remove_claude_mcp");
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === "check_claude_mcp_status")).toHaveLength(3);
  });
  it.each([
    [
      "CLAUDE_MCP_NAME_CONFLICT",
      "The Typr Local name is already used by another MCP server. Rename that server in Claude Desktop, then try again.",
    ],
    [
      "CLAUDE_MCP_SETTINGS_CONFLICT",
      "Your legacy Typr MCP configurations have different settings. Keep one configuration in Claude Desktop, then try again.",
    ],
  ])("explains setup conflict %s without marking the integration configured", async (code, content) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === "check_claude_mcp_status") {
        return false;
      }
      throw code;
    });
    await renderSettings();
    await vi.waitFor(() => expect(container.querySelector("output")?.textContent).toBe("false"));
    await act(async () => claudeButton().click());
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ content })));
    expect(container.querySelector("output")?.textContent).toBe("false");
    expect(claudeButton().textContent).toBe("Connect");
  });
});
