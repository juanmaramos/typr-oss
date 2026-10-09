// @vitest-environment jsdom
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeNoteId: "session-1",
  chatGroups: [
    { id: "group-1", session_id: "session-1", firstMessage: "First group", mostRecentMessageTimestamp: 1 },
    { id: "history-group", session_id: "session-1", firstMessage: "Past question", mostRecentMessageTimestamp: 2 },
    { id: "group-2", session_id: "session-2", firstMessage: "Second note group", mostRecentMessageTimestamp: 3 },
  ],
}));

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

vi.mock("@/contexts", async () => {
  const layout = await import("@/contexts/layout");
  return {
    useRightPanel: layout.useRightPanel,
    useTypr: () => ({ userId: "user-1" }),
  };
});
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/app/note/session-1" }),
  useNavigate: () => vi.fn(),
  useMatch: ({ from }: { from: string }) => from === "/app/note/$id"
    ? { params: { id: mocks.routeNoteId } }
    : undefined,
}));
vi.mock("react-hotkeys-hook", () => ({ useHotkeys: vi.fn() }));
vi.mock("@typr/ui", async () => {
  const React = await import("react");
  return {
    ResponsiveIconButton: ({ text, onClick }: { text: string; onClick: () => void }) =>
      React.createElement("button", { type: "button", onClick, "data-action": text }, text),
  };
});
vi.mock("@typr/ui/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/ui/ai-setup-indicator", () => ({ AISetupIndicator: () => null }));
vi.mock("@/components/ui/tab", async () => {
  const React = await import("react");
  return {
    Tab: ({ text, onSelect, value }: { text: string; onSelect: (value: string) => void; value: string }) =>
      React.createElement("button", { type: "button", onClick: () => onSelect(value) }, text),
  };
});
vi.mock("@/components/utils/debug-logger", () => ({ debugLogFor: vi.fn() }));
vi.mock("@/hooks/useTranscriptionActive", () => ({ useTranscriptionActive: () => ({ isRecordingActive: false }) }));
vi.mock("@/hooks/use-agent-writing-feature", () => ({ useAgentWritingFeature: () => false }));
vi.mock("../components/chat", async () => {
  const React = await import("react");
  return {
    ChatHistoryView: ({
      searchValue,
      onSearchChange,
      onSelectChat,
      onBackToChat,
    }: {
      searchValue: string;
      onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
      onSelectChat: (chatId: string) => void;
      onBackToChat: () => void;
    }) => React.createElement("div", { "data-testid": "chat-history" },
      React.createElement("input", {
        "data-testid": "history-search",
        value: searchValue,
        onChange: onSearchChange,
      }),
      React.createElement("button", {
        type: "button",
        "data-testid": "select-history-group",
        onClick: () => onSelectChat("history-group"),
      }, "Select history group"),
      React.createElement("button", { type: "button", "data-testid": "back-to-chat", onClick: onBackToChat }, "Back"),
    ),
    ChatInput: ({
      inputValue,
      onChange,
      researchMode,
      onResearchModeChange,
    }: {
      inputValue: string;
      onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
      researchMode: boolean;
      onResearchModeChange: (value: boolean) => void;
    }) => React.createElement("div", null,
      React.createElement("textarea", { "data-testid": "chat-draft", value: inputValue, onChange }),
      React.createElement("button", {
        type: "button",
        "data-testid": "research-mode",
        "aria-pressed": researchMode,
        onClick: () => onResearchModeChange(!researchMode),
      }, "Research mode"),
    ),
    ChatMessagesView: () => React.createElement("div", { "data-testid": "chat-messages" }),
    EmptyChatState: () => null,
  };
});
vi.mock("../components/search", async () => {
  const React = await import("react");
  return {
    ChatSearchHeader: ({
      searchTerm,
      onSearchTermChange,
      onClose,
    }: {
      searchTerm: string;
      onSearchTermChange: (value: string) => void;
      onClose: () => void;
    }) => React.createElement("div", null,
      React.createElement("input", {
        "data-testid": "message-search",
        value: searchTerm,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onSearchTermChange(event.target.value),
      }),
      React.createElement("button", { type: "button", "data-testid": "close-message-search", onClick: onClose }, "Close"),
    ),
  };
});
vi.mock("@/hooks/useEditModeModelSwitch.tsx", () => ({ useEditModeModelSwitch: vi.fn() }));
vi.mock("../hooks/useChatQueries", () => ({
  useChatQueries: ({ sessionId }: { sessionId: string | null }) => ({
    chatGroupsQuery: { data: mocks.chatGroups.filter((group) => group.session_id === sessionId) },
    sessionData: { data: { title: "Test note" }, refetch: vi.fn(async () => ({ data: { rawContent: "" } })) },
    getChatGroupId: vi.fn(async () => "group-1"),
    chatHistory: mocks.chatGroups
      .filter((group) => group.session_id === sessionId)
      .map((group) => ({ id: group.id, title: group.firstMessage })),
    totalSessionMessagesQuery: { data: 2 },
  }),
}));
vi.mock("../utils/chat-utils", () => ({ focusInput: vi.fn(), formatDate: vi.fn() }));
vi.mock("@/stores/useSelectionContext", () => ({ useSelectionContext: () => ({
  selectedText: null,
  selectionRange: null,
  sessionId: null,
  clearSelection: vi.fn(),
}) }));
vi.mock("@typr/utils/contexts", () => ({ useSessions: (selector: (state: object) => unknown) => selector({ sessions: {} }) }));
vi.mock("@typr/utils", () => ({
  AUTO_CLOUD_MODEL_ID: "auto",
  AUTO_CLOUD_MODEL_PRIORITY: [],
  CLOUD_GENERATION_TOKEN_BUDGETS: { chatAnswer: 1000 },
  containsUrl: () => false,
  resolveCloudModelIdForCurrentOs: (value: string) => value,
  setEnableBrowserSearch: vi.fn(),
}));
vi.mock("@typr/utils/ai", () => ({
  generateText: vi.fn(),
  modelProvider: vi.fn(),
  streamText: vi.fn(),
}));
vi.mock("@typr/plugin-connector", () => ({ commands: { getLlmConnection: vi.fn() } }));
vi.mock("@typr/plugin-db", () => ({ commands: { upsertChatMessage: vi.fn() } }));
vi.mock("@typr/plugin-local-llm", () => ({ commands: {} }));
vi.mock("@typr/plugin-misc", () => ({ commands: {} }));
vi.mock("@typr/plugin-template", () => ({ commands: { render: vi.fn() } }));
vi.mock("@/utils/inline-diff-preview", () => ({ showInlineDiffPreview: vi.fn() }));
vi.mock("@/utils/analytics-safe", () => ({ safeAnalyticsEvent: vi.fn() }));

import { LayoutProvider, useRightPanel } from "@/contexts/layout";
import { useChatState } from "@/stores/useChatState";
import { ChatView } from "./chat-view";

let root: Root;
let container: HTMLDivElement;

function OwnerFixture() {
  const { currentView, floatingState, openFloating, showSidebar, surface, getChatGroup } = useRightPanel();
  const shouldMountChat = surface === "sidebar"
    || (surface === "floating" && floatingState === "expanded" && currentView === "chat");

  return (
    <>
      <button type="button" data-testid="open-floating" onClick={() => openFloating("chat", { focus: false })} />
      <button type="button" data-testid="show-sidebar" onClick={() => showSidebar("chat")} />
      <output data-testid="active-chat-group">{getChatGroup(mocks.routeNoteId) ?? "none"}</output>
      {shouldMountChat && <ChatView key={surface} layout={surface === "sidebar" ? "sidebar" : "floating"} />}
    </>
  );
}

function inputValue(testId: string) {
  return container.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement | HTMLTextAreaElement;
}

function changeValue(testId: string, value: string) {
  const input = inputValue(testId);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(testId: string) {
  const button = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function clickAction(text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-action]"))
    .find((candidate) => candidate.getAttribute("data-action") === text);
  if (!button) {
    throw new Error(`Missing action button: ${text}`);
  }
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function render() {
  await act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <LayoutProvider>
          <OwnerFixture />
        </LayoutProvider>
      </I18nProvider>,
    );
  });
}

describe("ChatView state across active-surface remounts", () => {
  beforeEach(() => {
    mocks.routeNoteId = "session-1";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    container = document.createElement("div");
    root = createRoot(container);
    useChatState.getState().clearSession("session-1");
    useChatState.getState().setMessages("session-1", [
      { id: "message-1", content: "A prior answer", isUser: false, timestamp: new Date() },
      { id: "message-2", content: "Another answer", isUser: false, timestamp: new Date() },
    ]);
    useChatState.getState().setMessages("session-2", [
      { id: "message-3", content: "A different note answer", isUser: false, timestamp: new Date() },
    ]);
  });

  afterEach(() => {
    act(() => root.unmount());
    useChatState.getState().clearSession("session-1");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retains the note draft, active group, history filter, research mode, and search query after a surface handoff", async () => {
    await render();
    click("open-floating");
    changeValue("chat-draft", "Keep this draft");
    click("research-mode");
    clickAction("History");
    changeValue("history-search", "Past");
    click("select-history-group");
    clickAction("Search");
    changeValue("message-search", "answer");

    click("show-sidebar");
    act(() => vi.runAllTimers());

    expect(inputValue("chat-draft").value).toBe("Keep this draft");
    expect(container.querySelector("[data-testid='active-chat-group']")?.textContent).toBe("history-group");
    expect(container.querySelector("[data-testid='research-mode']")?.getAttribute("aria-pressed")).toBe("true");
    expect(inputValue("message-search").value).toBe("answer");

    click("close-message-search");
    clickAction("History");
    expect(inputValue("history-search").value).toBe("Past");

    mocks.routeNoteId = "session-2";
    await render();
    expect(inputValue("chat-draft").value).toBe("");
    expect(container.querySelector("[data-testid='active-chat-group']")?.textContent).toBe("none");
    expect(container.querySelector("[data-testid='research-mode']")?.getAttribute("aria-pressed")).toBe("false");
    clickAction("Search");
    expect(inputValue("message-search").value).toBe("");

    changeValue("chat-draft", "Session two draft");
    click("research-mode");
    changeValue("message-search", "second note");

    mocks.routeNoteId = "session-1";
    await render();
    expect(inputValue("history-search").value).toBe("Past");
    click("back-to-chat");
    expect(inputValue("chat-draft").value).toBe("Keep this draft");
    expect(container.querySelector("[data-testid='active-chat-group']")?.textContent).toBe("history-group");
    expect(container.querySelector("[data-testid='research-mode']")?.getAttribute("aria-pressed")).toBe("true");
    clickAction("Search");
    expect(inputValue("message-search").value).toBe("answer");

    mocks.routeNoteId = "session-2";
    await render();
    expect(inputValue("chat-draft").value).toBe("Session two draft");
    expect(container.querySelector("[data-testid='active-chat-group']")?.textContent).toBe("none");
    expect(container.querySelector("[data-testid='research-mode']")?.getAttribute("aria-pressed")).toBe("true");
    expect(inputValue("message-search").value).toBe("second note");
  });
});
