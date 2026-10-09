import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { debugLogFor, debugWarnFor } from "@/components/utils/debug-logger";
import { useChatState } from "@/stores/useChatState";
import { commands as dbCommands } from "@typr/plugin-db";
import type { Word } from "@typr/plugin-db";
import { parseMarkdownBlocks } from "../utils/markdown-parser";

interface UseChatQueriesProps {
  sessionId: string | null;
  userId: string | null;
  currentChatGroupId: string | null;
  setCurrentChatGroupId: (id: string | null) => void;
  setHasChatStarted: (started: boolean) => void;
  isNewChatRequested: boolean;
  setIsNewChatRequested: (requested: boolean) => void;
  isNewChatPending: boolean;
  completeNewChat: (sessionId: string) => void;
  isActiveSurface: boolean;
  allowAutoSelectLatest: boolean;
  selectionSource: "sidebar" | "floating";
}

export type ChatSessionContextData = {
  title: string;
  rawContent: string;
  enhancedContent: string | null;
  preMeetingContent: string | null;
  words: Word[];
};

export function useChatQueries({
  sessionId,
  userId,
  currentChatGroupId,
  setCurrentChatGroupId,
  setHasChatStarted,
  isNewChatRequested,
  setIsNewChatRequested,
  isNewChatPending,
  completeNewChat,
  isActiveSurface,
  allowAutoSelectLatest,
  selectionSource,
}: UseChatQueriesProps) {
  // Get state from Zustand store
  const { isGenerating: isGeneratingFn, setMessages } = useChatState();
  const queryClient = useQueryClient();
  const isGenerating = sessionId ? isGeneratingFn(sessionId) : false;

  // Track previous generating state
  const prevIsGenerating = useRef(false);

  const chatGroupsQuery = useQuery({
    enabled: !!sessionId && !!userId,
    queryKey: ["chat-groups", sessionId],
    queryFn: async () => {
      if (!sessionId || !userId) {
        return [];
      }
      const groups = await dbCommands.listChatGroups(sessionId);

      const groupsWithFirstMessage = await Promise.all(
        groups.map(async (group) => {
          const messages = await dbCommands.listChatMessages(group.id);
          const firstUserMessage = messages.find(msg => msg.role === "User");

          // Find the most recent message timestamp in this group
          const mostRecentMessageTimestamp = messages.length > 0
            ? Math.max(...messages.map(msg => new Date(msg.created_at).getTime()))
            : new Date(group.created_at).getTime(); // Fallback to group creation time if no messages

          return {
            ...group,
            firstMessage: firstUserMessage?.content || "",
            mostRecentMessageTimestamp,
          };
        }),
      );

      return groupsWithFirstMessage;
    },
  });

  useEffect(() => {
    if (currentChatGroupId) {
      const selectedGroup = chatGroupsQuery.data?.find((group) => group.id === currentChatGroupId);
      const selectedGroupExists = !!selectedGroup;

      if (selectedGroupExists || !allowAutoSelectLatest) {
        debugLogFor("DEBUG_CHAT", "ChatDebug", "preserving selected chat group", {
          currentChatGroupId,
          sessionId,
          selectionSource,
          selectedGroupExists,
          allowAutoSelectLatest,
        });
        return;
      }
    }

    if (isNewChatRequested) {
      debugLogFor("DEBUG_CHAT", "ChatDebug", "skipping auto-select because new chat was requested");
      return;
    }

    if (!allowAutoSelectLatest) {
      debugLogFor("DEBUG_CHAT", "ChatDebug", "suppressing auto-select by policy", {
        sessionId,
        selectionSource,
      });
      return;
    }

    if (chatGroupsQuery.data && chatGroupsQuery.data.length > 0) {
      // Sort by most recent message timestamp instead of group creation time.
      // Avoid mutating query data in place so selection logic stays predictable.
      const latestGroup = [...chatGroupsQuery.data].sort((a, b) =>
        b.mostRecentMessageTimestamp - a.mostRecentMessageTimestamp
      )[0];
      debugLogFor("DEBUG_CHAT", "ChatDebug", "auto-selecting latest chat group", {
        latestGroupId: latestGroup.id,
        sessionId,
        totalGroups: chatGroupsQuery.data.length,
      });
      setCurrentChatGroupId(latestGroup.id);
    } else if (chatGroupsQuery.data && chatGroupsQuery.data.length === 0) {
      debugLogFor("DEBUG_CHAT", "ChatDebug", "no chat groups for session", { sessionId });
      setCurrentChatGroupId(null);
      if (sessionId) {
        setMessages(sessionId, []);
      }
      setHasChatStarted(false);
    }
  }, [
    allowAutoSelectLatest,
    chatGroupsQuery.data,
    currentChatGroupId,
    isNewChatRequested,
    selectionSource,
    sessionId,
    setCurrentChatGroupId,
    setHasChatStarted,
    setMessages,
  ]);

  const chatMessagesQuery = useQuery({
    enabled: !!currentChatGroupId,
    queryKey: ["chat-messages", currentChatGroupId],
    queryFn: async () => {
      if (!currentChatGroupId) {
        return [];
      }

      // Loading messages for chat group (removed verbose debug logging)

      const dbMessages = await dbCommands.listChatMessages(currentChatGroupId);
      return dbMessages.map(msg => {
        let parts;
        let content = msg.content;

        // Try to deserialize parts from database first
        if (msg.parts && msg.parts !== "null") {
          try {
            parts = JSON.parse(msg.parts);
          } catch (error) {
            console.warn("Failed to parse message parts from DB:", error);
            // Fall back to parsing markdown blocks for legacy messages
            parts = msg.role === "Assistant" ? parseMarkdownBlocks(msg.content) : undefined;
          }
        } else if (msg.role === "Assistant") {
          // Legacy fallback for messages without parts field
          parts = parseMarkdownBlocks(msg.content);
        }

        return {
          id: msg.id,
          content: content,
          isUser: msg.role === "User",
          timestamp: new Date(msg.created_at),
          parts,
        };
      });
    },
  });

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    if (!isActiveSurface) {
      return;
    }

    const justFinishedGenerating = prevIsGenerating.current === true && isGenerating === false;
    prevIsGenerating.current = isGenerating;

    if (chatMessagesQuery.data) {
      debugLogFor("DEBUG_CHAT", "ChatDebug", "message sync effect running", {
        sessionId,
        currentChatGroupId,
        messageCount: chatMessagesQuery.data.length,
        isGenerating,
        justFinishedGenerating,
        firstMessageId: chatMessagesQuery.data[0]?.id,
      });

      // Verify that the messages belong to a group for this session.
      if (currentChatGroupId) {
        const selectedGroup = chatGroupsQuery.data?.find(
          (group) => group.id === currentChatGroupId,
        );

        if (!selectedGroup) {
          debugWarnFor("DEBUG_CHAT", "ChatDebug", "skipping message sync until selected chat group is verified", {
            sessionId,
            currentChatGroupId,
            chatGroupsLoaded: !!chatGroupsQuery.data,
          });
          return;
        } else if (selectedGroup.session_id !== sessionId) {
          console.warn(
            "[useChatQueries] PREVENTED MESSAGE LEAK: Chat group",
            currentChatGroupId,
            "does not belong to session",
            sessionId,
          );
          return; // Don't set messages from a different session
        }
      }

      if (isGenerating) {
        // During generation: merge DB messages with any newer streaming messages
        const dbMessages = chatMessagesQuery.data;
        setMessages(sessionId, (prevMessages) => {
          // Find the latest DB message timestamp
          const latestDbTimestamp = dbMessages.length > 0
            ? Math.max(...dbMessages.map(m => m.timestamp.getTime()))
            : 0;

          // Keep any local messages that are newer than DB (these are streaming)
          const streamingMessages = prevMessages.filter((m) => m.timestamp.getTime() > latestDbTimestamp);

          // Only merge if we have streaming messages to preserve
          if (streamingMessages.length > 0) {
            return [...dbMessages, ...streamingMessages];
          } else {
            return dbMessages;
          }
        });
      } else if (!justFinishedGenerating) {
        // Not generating and didn't just finish: DB is source of truth
        debugLogFor("DEBUG_CHAT", "ChatDebug", "setting messages for session", { sessionId });
        setMessages(sessionId, chatMessagesQuery.data);
      }
      // If justFinishedGenerating, don't update to prevent overwriting final AI response

      setHasChatStarted(chatMessagesQuery.data.length > 0);
    }
  }, [
    chatMessagesQuery.data,
    isGenerating,
    setMessages,
    setHasChatStarted,
    sessionId,
    currentChatGroupId,
    chatGroupsQuery.data,
    isActiveSurface,
  ]);

  const loadSessionData = async (capturedSessionId: string): Promise<ChatSessionContextData | null> => {
    const session = await dbCommands.getSession({ id: capturedSessionId });
    if (!session) {
      return null;
    }

    return {
      title: session.title || "",
      rawContent: session.raw_memo_html || "",
      enhancedContent: session.enhanced_memo_html,
      preMeetingContent: session.pre_meeting_memo_html,
      words: session.words || [],
    };
  };

  const sessionDataQuery = useQuery({
    enabled: !!sessionId,
    queryKey: ["session", "chat-context", sessionId],
    queryFn: () => sessionId ? loadSessionData(sessionId) : null,
  });
  const fetchSessionData = (capturedSessionId: string) => queryClient.fetchQuery({
    queryKey: ["session", "chat-context", capturedSessionId],
    queryFn: () => loadSessionData(capturedSessionId),
    staleTime: 0,
  });
  const getChatGroupId = async (signal?: AbortSignal): Promise<string> => {
    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted", "AbortError");
      }
    };

    throwIfAborted();
    if (!sessionId || !userId) {
      throw new Error("No session or user");
    }

    if (currentChatGroupId && !isNewChatRequested && !isNewChatPending) {
      debugLogFor("DEBUG_CHAT", "ChatDebug", "reusing existing chat group", { currentChatGroupId, sessionId });
      return currentChatGroupId;
    }

    debugLogFor("DEBUG_CHAT", "ChatDebug", "creating new chat group", {
      sessionId,
      isNewChatRequested,
      isNewChatPending,
      ignoredCurrentChatGroupId: currentChatGroupId,
    });
    const chatGroup = await dbCommands.createChatGroup({
      id: crypto.randomUUID(),
      session_id: sessionId,
      user_id: userId,
      name: null,
      created_at: new Date().toISOString(),
    });

    throwIfAborted();
    debugLogFor("DEBUG_CHAT", "ChatDebug", "new chat group created", { newGroupId: chatGroup.id, sessionId });
    const chatGroupsQueryKey = ["chat-groups", sessionId] as const;
    await queryClient.cancelQueries({ queryKey: chatGroupsQueryKey, exact: true });
    throwIfAborted();

    type ChatGroupWithMessage = NonNullable<typeof chatGroupsQuery.data>[number];
    const existingGroups = queryClient.getQueryData<ChatGroupWithMessage[]>(chatGroupsQueryKey);
    if (existingGroups) {
      const createdGroupSummary: ChatGroupWithMessage = {
        ...chatGroup,
        firstMessage: "",
        mostRecentMessageTimestamp: new Date(chatGroup.created_at).getTime(),
      };
      queryClient.setQueryData<ChatGroupWithMessage[]>(chatGroupsQueryKey, [
        ...existingGroups.filter((group) => group.id !== chatGroup.id),
        createdGroupSummary,
      ]);
    }
    setCurrentChatGroupId(chatGroup.id);
    // Clear the new chat flag now that we've created the group
    setIsNewChatRequested(false);
    completeNewChat(sessionId);
    void queryClient.invalidateQueries({ queryKey: chatGroupsQueryKey, exact: true });
    return chatGroup.id;
  };

  // Build chat history for UI from chat groups data
  const chatHistory = useMemo(() => {
    if (!chatGroupsQuery.data) {
      return [];
    }

    return chatGroupsQuery.data
      .filter(group => group.firstMessage) // Only groups with messages
      .map(group => ({
        id: group.id,
        title: group.firstMessage.length > 50
          ? group.firstMessage.substring(0, 50) + "..."
          : group.firstMessage,
        lastMessageDate: new Date(group.mostRecentMessageTimestamp),
        messages: [], // Not needed for history view
      }))
      .sort((a, b) => b.lastMessageDate.getTime() - a.lastMessageDate.getTime());
  }, [chatGroupsQuery.data]);

  // Query total messages across all groups for limit enforcement
  const totalSessionMessagesQuery = useQuery({
    enabled: !!sessionId && !!chatGroupsQuery.data,
    queryKey: ["total-session-messages", sessionId],
    queryFn: async () => {
      if (!sessionId || !chatGroupsQuery.data) {
        return 0;
      }

      let total = 0;
      for (const group of chatGroupsQuery.data) {
        const messages = await dbCommands.listChatMessages(group.id);
        total += messages.length;
      }
      return total;
    },
  });

  return {
    chatGroupsQuery,
    chatMessagesQuery,
    sessionData: sessionDataQuery,
    fetchSessionData,
    getChatGroupId,
    chatHistory,
    totalSessionMessagesQuery,
  };
}
