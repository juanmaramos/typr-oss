// @vitest-environment jsdom
import { messages } from "@/locales/en/messages.po";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { TooltipProvider } from "@typr/ui/components/ui/tooltip";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChat } from "./project-chat";

const api = vi.hoisted(() => ({
  getAskThread: vi.fn(),
  listAskMessages: vi.fn(),
  listAskContextSnapshots: vi.fn(),
  generateAssistantAnswerForThread: vi.fn(),
  isAskGenerationStale: vi.fn(),
}));
vi.mock("@/lib/ask", () => ({
  ...api,
  askQueryKeys: { thread: "ask:thread", messages: "ask:messages", snapshots: "ask:snapshots", threads: "ask:threads" },
  appendAskUserMessage: vi.fn(),
  markAskMessageFailed: vi.fn(),
  parseAskSnapshotSources: () => [],
}));
vi.mock("@/contexts", () => ({ useTypr: () => ({ userId: "user" }) }));
vi.mock("@/hooks/useModels", () => ({ useAllModels: () => ({ selectedModel: { id: "local" }, isAutoMode: false }) }));
vi.mock(
  "@/lib/projects",
  () => ({ getProject: async () => ({ id: "alpha", name: "Alpha" }), projectQueryKeys: { detail: "project" } }),
);
vi.mock("@/lib/project-files", () => ({ listProjectFiles: async () => [], projectFileQueryKeys: { list: "files" } }));
vi.mock(
  "@/components/ask/ask-composer",
  () => ({
    AskComposer: ({ disabled, placeholder }: { disabled: boolean; placeholder: string }) => (
      <textarea aria-label="Project composer" disabled={disabled} placeholder={placeholder} />
    ),
  }),
);
vi.mock(
  "@/components/projects/project-source-citation-markdown",
  () => ({ hasProjectSourceCitations: () => false, ProjectSourceCitationMarkdown: () => null }),
);
vi.mock("@/utils/analytics-events", () => ({ trackEvent: vi.fn() }));
vi.mock("@typr/ui/components/ui/toast", () => ({ toast: vi.fn() }));

const userMessage = {
  id: "user-message",
  thread_id: "thread",
  role: "User",
  content: "Project question",
  status: "Complete",
  created_at: new Date().toISOString(),
  model_id: "local",
};
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const settle = () => new Promise(resolve => setTimeout(resolve, 25));
async function render() {
  const rootRoute = createRootRoute({ component: () => <ProjectChat projectId="alpha" threadId="thread" /> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ["/"] }) });
  await act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    await router.load();
    await settle();
  });
  await act(async () => {
    await settle();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  i18n.load("en", messages);
  i18n.activate("en");
  Object.values(api).forEach(mock => mock.mockReset());
  api.getAskThread.mockResolvedValue({ id: "thread", scope_type: "Project", scope_id: "alpha", archived_at: null });
  api.listAskMessages.mockResolvedValue([userMessage]);
  api.listAskContextSnapshots.mockResolvedValue([]);
  api.isAskGenerationStale.mockReturnValue(false);
  api.generateAssistantAnswerForThread.mockImplementation(() => new Promise(() => {}));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Element.prototype.scrollTo = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("project conversation scope and resume safety", () => {
  it.each(["Note", "Workspace"])("does not read messages or generate for a %s thread", async scope => {
    const thread = { id: "thread", scope_type: scope, scope_id: "alpha" };
    client.setQueryData(["ask:thread", "thread"], thread);
    client.setQueryData(["ask:messages", "thread"], [userMessage]);
    api.getAskThread.mockResolvedValue(thread);
    await render();
    await vi.waitFor(async () => {
      await act(async () => {
        await settle();
      });
      expect(container.textContent).toContain("Conversation not found");
    });
    expect(api.listAskMessages).not.toHaveBeenCalled();
    expect(api.listAskContextSnapshots).not.toHaveBeenCalled();
    expect(api.generateAssistantAnswerForThread).not.toHaveBeenCalled();
  });

  it("waits for fresh messages on resume and does not duplicate an in-progress answer", async () => {
    client.setQueryData(["ask:thread", "thread"], { id: "thread", scope_type: "Project", scope_id: "alpha" });
    client.setQueryData(["ask:messages", "thread"], [userMessage]);
    let resolveMessages!: (value: unknown[]) => void;
    api.listAskMessages.mockImplementation(() =>
      new Promise(resolve => {
        resolveMessages = resolve;
      })
    );
    await render();
    expect(api.generateAssistantAnswerForThread).not.toHaveBeenCalled();
    await act(async () => {
      resolveMessages([userMessage, {
        ...userMessage,
        id: "answer",
        role: "Assistant",
        status: "Streaming",
        content: "Working",
      }]);
      await settle();
    });
    expect(api.generateAssistantAnswerForThread).not.toHaveBeenCalled();
  });

  it("keeps bookmarked archived chats readable without accepting unanswered messages", async () => {
    api.getAskThread.mockResolvedValue({
      id: "thread",
      scope_type: "Project",
      scope_id: "alpha",
      archived_at: "2026-10-01T12:00:00Z",
    });
    api.listAskMessages.mockResolvedValue([userMessage, {
      ...userMessage,
      id: "interrupted",
      role: "Assistant",
      status: "Streaming",
      content: "",
    }]);
    api.isAskGenerationStale.mockImplementation((message: { role: string }) => message.role === "Assistant");
    await render();
    await vi.waitFor(async () => {
      await act(async () => {
        await settle();
      });
      expect(container.textContent).toContain("Project question");
    });
    const composer = container.querySelector<HTMLTextAreaElement>("[aria-label=\"Project composer\"]");
    expect(composer?.disabled).toBe(true);
    expect(composer?.placeholder).toBe("This project chat is archived");
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent === "Retry");
    expect(retry?.disabled).toBe(true);
    await act(async () => {
      retry!.click();
    });
    expect(api.generateAssistantAnswerForThread).not.toHaveBeenCalled();
  });

  it("still generates one answer after a valid project question finishes loading", async () => {
    await render();
    await vi.waitFor(() => expect(api.generateAssistantAnswerForThread).toHaveBeenCalledTimes(1));
    expect(api.generateAssistantAnswerForThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread", modelId: "local" }),
    );
  });
});
