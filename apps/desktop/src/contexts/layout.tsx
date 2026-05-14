import { debugLogFor } from "@/components/utils/debug-logger";
import { useResponsive } from "@/hooks/use-responsive";
import { useLocation } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RightPanelView = "chat" | "transcript" | "project-brief";
export type AssistantSurface = "floating" | "sidebar";
export type FloatingPanelState = "collapsed" | "expanded";
export interface NewChatRequest {
  sessionId: string;
  requestId: number;
}

type PanelIntent = "user" | "system";

interface LeftSidebarState {
  open: boolean;
  by: PanelIntent;
}

// ─── Context type ────────────────────────────────────────────────────────────

interface LayoutContextType {
  // Left sidebar
  leftSidebar: {
    isExpanded: boolean;
    setIsExpanded: (v: boolean) => void;
    togglePanel: () => void;
    openMobile: boolean;
    setOpenMobile: (v: boolean) => void;
    isMobile: boolean;
  };

  // Right panel
  rightPanel: {
    surface: AssistantSurface;
    view: RightPanelView;
    currentView: RightPanelView;
    isExpanded: boolean;
    isFloatingOpen: boolean;
    floatingState: FloatingPanelState;
    isViewVisible: (view: RightPanelView) => boolean;
    setIsExpanded: (v: boolean) => void;
    showSidebar: (view?: RightPanelView) => void;
    showFloatingDock: (view?: RightPanelView) => void;
    toggleSidebarSurface: (view?: RightPanelView) => void;
    togglePanel: (view?: RightPanelView) => void;
    openFloating: (view?: RightPanelView, options?: { focus?: boolean }) => void;
    collapseFloating: () => void;
    closeFloating: () => void;
    hidePanel: () => void;
    switchView: (view: RightPanelView) => void;
    getChatGroup: (sessionId: string) => string | null;
    setChatGroup: (sessionId: string, groupId: string | null) => void;
    clearChatGroup: (sessionId: string) => void;
    newChatRequest: NewChatRequest | null;
    requestNewChat: (sessionId: string) => number;
    consumeNewChatRequest: (requestId: number) => void;
    isNewChatPending: (sessionId: string) => boolean;
    completeNewChat: (sessionId: string) => void;
    getPendingFloatingPrompt: (sessionId: string) => string | null;
    queueFloatingPrompt: (sessionId: string, prompt: string | null) => void;
    consumeFloatingPrompt: (sessionId: string) => string | null;
    getChatDraft: (sessionId: string) => string;
    setChatDraft: (sessionId: string, draft: string) => void;
    clearChatDraft: (sessionId: string) => void;
    clearChatState: (sessionId: string) => void;
    chatInputRef: React.RefObject<HTMLTextAreaElement>;
  };
}

const LayoutContext = createContext<LayoutContextType | null>(null);

// ─── Auto-collapse constants ─────────────────────────────────────────────────

const AUTO_COLLAPSE_WIDTH = 1460;

// ─── Provider ────────────────────────────────────────────────────────────────

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const { isMobile } = useResponsive();
  const location = useLocation();

  // ── Left sidebar state ──────────────────────────────────────────────────
  const [leftState, setLeftState] = useState<LeftSidebarState>({ open: true, by: "user" });
  const [openMobile, setOpenMobile] = useState(false);

  const setLeftExpanded = useCallback((v: boolean) => {
    setLeftState({ open: v, by: "user" });
  }, []);

  const setLeftExpandedBySystem = useCallback((v: boolean) => {
    setLeftState({ open: v, by: "system" });
  }, []);

  const toggleLeftPanel = useCallback(() => {
    if (isMobile) {
      setOpenMobile(prev => !prev);
    } else {
      setLeftState(prev => ({ open: !prev.open, by: "user" }));
    }
  }, [isMobile]);

  useHotkeys(
    "mod+.",
    (event) => {
      event.preventDefault();
      toggleLeftPanel();
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  // ── Right panel state ───────────────────────────────────────────────────
  const [surface, setSurface] = useState<AssistantSurface>("floating");
  const [view, setView] = useState<RightPanelView>("chat");
  const [floatingState, setFloatingState] = useState<FloatingPanelState>("collapsed");
  const [activeChatGroupIdBySession, setActiveChatGroupIdBySession] = useState<
    Record<string, string | null>
  >({});
  const [pendingFloatingPromptBySession, setPendingFloatingPromptBySession] = useState<Record<string, string | null>>(
    {},
  );
  const [chatDraftBySession, setChatDraftBySession] = useState<Record<string, string>>({});
  const [newChatRequest, setNewChatRequest] = useState<NewChatRequest | null>(null);
  const [pendingNewChatBySession, setPendingNewChatBySession] = useState<Record<string, boolean>>({});
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const preferredSurface = useRef<"sidebar" | "floating">("floating");
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const newChatRequestIdRef = useRef(0);

  const currentView = view;
  const isRightExpanded = surface === "sidebar";
  const isFloatingOpen = floatingState === "expanded";

  const focusChatInput = useCallback((delayMs = 150) => {
    setTimeout(() => {
      const attemptFocus = () => {
        if (chatInputRef.current) {
          chatInputRef.current.focus();
          return;
        }
        setTimeout(attemptFocus, 50);
      };
      attemptFocus();
    }, delayMs);
  }, []);

  const showSidebar = useCallback((v: RightPanelView = view) => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "panel → sidebar", { view: v });
    preferredSurface.current = "sidebar";
    setSurface("sidebar");
    setView(v);
    setFloatingState("collapsed");
    if (v === "chat") {
      focusChatInput(350);
    }
  }, [view, focusChatInput]);

  const showFloatingDock = useCallback((v: RightPanelView = view) => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "panel → floating:collapsed", { view: v });
    setView(v);
    setSurface("floating");
    setFloatingState("collapsed");
  }, [view]);

  const setRightExpanded = useCallback((nextExpanded: boolean) => {
    if (nextExpanded) {
      showSidebar();
      return;
    }
    showFloatingDock();
  }, [showFloatingDock, showSidebar]);

  const toggleSidebarSurface = useCallback((v: RightPanelView = currentView) => {
    if (surface === "sidebar" && isRightExpanded) {
      showFloatingDock(v);
      return;
    }
    showSidebar(v);
  }, [currentView, isRightExpanded, surface, showFloatingDock, showSidebar]);

  const hidePanel = useCallback(() => {
    showFloatingDock();
    setTimeout(() => {
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    }, 0);
  }, [showFloatingDock]);

  const openFloating = useCallback((v: RightPanelView = "chat", options: { focus?: boolean } = {}) => {
    const { focus = true } = options;
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "panel → floating:expanded", { view: v });
    preferredSurface.current = "floating";
    setView(v);
    setFloatingState("expanded");
    setSurface("floating");
    if (v === "chat" && focus) {
      focusChatInput();
    }
  }, [focusChatInput]);

  const collapseFloating = useCallback(() => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "panel → floating:collapsed");
    setFloatingState("collapsed");
  }, []);

  const closeFloating = useCallback(() => {
    debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "panel → floating:collapsed");
    setFloatingState("collapsed");
  }, []);

  const switchView = useCallback((v: RightPanelView) => {
    setView(v);
    if (v === "chat" && (surface === "sidebar" || floatingState === "expanded")) {
      focusChatInput(surface === "sidebar" ? 350 : 150);
    }
  }, [floatingState, focusChatInput, surface]);

  const isViewVisible = useCallback((v: RightPanelView) => {
    if (surface === "sidebar") {
      return currentView === v;
    }
    return currentView === v && floatingState === "expanded";
  }, [currentView, floatingState, surface]);

  const getChatGroup = useCallback((sessionId: string) => {
    return activeChatGroupIdBySession[sessionId] ?? null;
  }, [activeChatGroupIdBySession]);

  const setChatGroup = useCallback((sessionId: string, groupId: string | null) => {
    setActiveChatGroupIdBySession((prev) => ({ ...prev, [sessionId]: groupId }));
  }, []);

  const clearChatGroup = useCallback((sessionId: string) => {
    setActiveChatGroupIdBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  const getPendingFloatingPrompt = useCallback((sessionId: string) => {
    return pendingFloatingPromptBySession[sessionId] ?? null;
  }, [pendingFloatingPromptBySession]);

  const queueFloatingPrompt = useCallback((sessionId: string, prompt: string | null) => {
    setPendingFloatingPromptBySession((prev) => ({ ...prev, [sessionId]: prompt }));
  }, []);

  const consumeFloatingPrompt = useCallback((sessionId: string) => {
    const prompt = pendingFloatingPromptBySession[sessionId] ?? null;
    setPendingFloatingPromptBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    return prompt;
  }, [pendingFloatingPromptBySession]);

  const getChatDraft = useCallback((sessionId: string) => {
    return chatDraftBySession[sessionId] ?? "";
  }, [chatDraftBySession]);

  const setChatDraft = useCallback((sessionId: string, draft: string) => {
    setChatDraftBySession((prev) => {
      if (!draft) {
        if (!(sessionId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[sessionId];
        return next;
      }
      return { ...prev, [sessionId]: draft };
    });
  }, []);

  const clearChatDraft = useCallback((sessionId: string) => {
    setChatDraftBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  const clearChatState = useCallback((sessionId: string) => {
    setActiveChatGroupIdBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setPendingFloatingPromptBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    clearChatDraft(sessionId);
  }, [clearChatDraft]);

  const requestNewChat = useCallback((sessionId: string) => {
    clearChatState(sessionId);
    setPendingNewChatBySession((prev) => ({ ...prev, [sessionId]: true }));
    newChatRequestIdRef.current += 1;
    const requestId = newChatRequestIdRef.current;
    setNewChatRequest({
      sessionId,
      requestId,
    });
    return requestId;
  }, [clearChatState]);

  const consumeNewChatRequest = useCallback((requestId: number) => {
    setNewChatRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const isNewChatPending = useCallback((sessionId: string) => {
    return !!pendingNewChatBySession[sessionId];
  }, [pendingNewChatBySession]);

  const completeNewChat = useCallback((sessionId: string) => {
    setPendingNewChatBySession((prev) => {
      if (!(sessionId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }, []);

  const togglePanel = useCallback(
    (v?: RightPanelView) => {
      const targetView = v ?? currentView;

      if (surface === "floating") {
        if (isFloatingOpen) {
          if (currentView === targetView) {
            showFloatingDock(targetView);
            return;
          }
          setView(targetView);
          if (targetView === "chat") {
            focusChatInput();
          }
          return;
        }
        previouslyFocusedElement.current = document.activeElement as HTMLElement;
        if (preferredSurface.current === "sidebar") {
          showSidebar(targetView);
        } else {
          openFloating(targetView);
        }
        return;
      }

      if (isRightExpanded && currentView === targetView) {
        showFloatingDock(targetView);
        return;
      }

      showSidebar(targetView);
    },
    [
      currentView,
      isRightExpanded,
      isFloatingOpen,
      surface,
      openFloating,
      showFloatingDock,
      showSidebar,
      focusChatInput,
    ],
  );

  // ── Hotkeys for right panel ─────────────────────────────────────────────

  useHotkeys(
    "mod+alt+.",
    (event) => {
      event.preventDefault();
      toggleSidebarSurface("chat");
    },
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  useHotkeys(
    "mod+t",
    (event) => {
      event.preventDefault();

      if (surface === "floating") {
        if (currentView !== "transcript") {
          openFloating("transcript");
          return;
        }
        if (floatingState === "expanded") {
          showFloatingDock("transcript");
        } else {
          openFloating("transcript");
        }
        return;
      }

      if (isRightExpanded && currentView === "transcript") {
        showFloatingDock("transcript");
        return;
      }

      showSidebar("transcript");
    },
    [currentView, floatingState, isRightExpanded, surface, openFloating, showFloatingDock, showSidebar],
    { enableOnFormTags: true, enableOnContentEditable: true },
  );

  // ── Auto-collapse left sidebar when right panel opens on narrow screens ─

  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const prevShouldCollapseRef = useRef(false);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isNoteRoute = location.pathname.startsWith("/app/note/");
  const isProjectBriefRoute = location.pathname.startsWith("/app/projects/") && currentView === "project-brief";
  const isRightSidebarVisible = surface === "sidebar";
  const isTight = !isMobile && (isNoteRoute || isProjectBriefRoute) && isRightSidebarVisible
    && windowWidth < AUTO_COLLAPSE_WIDTH;

  // Track whether the window width (not surface changes) made it tight/roomy
  const prevWindowWidthRef = useRef(windowWidth);
  const prevRightSidebarRef = useRef(isRightSidebarVisible);

  useEffect(() => {
    const widthChanged = windowWidth !== prevWindowWidthRef.current;
    const rightSidebarOpened = isRightSidebarVisible && !prevRightSidebarRef.current;

    prevWindowWidthRef.current = windowWidth;
    prevRightSidebarRef.current = isRightSidebarVisible;

    // Collapse left when right sidebar opens and window is narrow
    if (rightSidebarOpened && isTight && leftState.open) {
      debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "auto-collapsing left sidebar", {
        reason: "right-sidebar-open",
        windowWidth,
        threshold: AUTO_COLLAPSE_WIDTH,
        leftBy: leftState.by,
      });
      setLeftExpandedBySystem(false);
      return;
    }

    // Collapse left when window resizes smaller while right sidebar is open
    if (widthChanged && isTight && !prevShouldCollapseRef.current && leftState.open) {
      debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "auto-collapsing left sidebar", {
        reason: "window-tight",
        windowWidth,
        threshold: AUTO_COLLAPSE_WIDTH,
        leftBy: leftState.by,
      });
      setLeftExpandedBySystem(false);
      prevShouldCollapseRef.current = true;
      return;
    }

    // Only restore on window resize making room — NOT when right sidebar closes
    if (widthChanged && !isTight && prevShouldCollapseRef.current && !leftState.open && leftState.by === "system") {
      debugLogFor("DEBUG_LAYOUT", "LayoutDebug", "restoring left sidebar", {
        reason: "window-roomy",
        windowWidth,
        threshold: AUTO_COLLAPSE_WIDTH,
      });
      setLeftExpandedBySystem(true);
      prevShouldCollapseRef.current = false;
      return;
    }

    prevShouldCollapseRef.current = isTight;
  }, [isTight, windowWidth, isRightSidebarVisible, leftState, setLeftExpandedBySystem]);

  // ── Context value ───────────────────────────────────────────────────────

  const value = useMemo<LayoutContextType>(() => ({
    leftSidebar: {
      isExpanded: leftState.open,
      setIsExpanded: setLeftExpanded,
      togglePanel: toggleLeftPanel,
      openMobile,
      setOpenMobile,
      isMobile,
    },
    rightPanel: {
      surface,
      view,
      currentView,
      isExpanded: isRightExpanded,
      isFloatingOpen,
      floatingState,
      isViewVisible,
      setIsExpanded: setRightExpanded,
      showSidebar,
      showFloatingDock,
      toggleSidebarSurface,
      togglePanel,
      openFloating,
      collapseFloating,
      closeFloating,
      hidePanel,
      switchView,
      getChatGroup,
      setChatGroup,
      clearChatGroup,
      newChatRequest,
      requestNewChat,
      consumeNewChatRequest,
      isNewChatPending,
      completeNewChat,
      getPendingFloatingPrompt,
      queueFloatingPrompt,
      consumeFloatingPrompt,
      getChatDraft,
      setChatDraft,
      clearChatDraft,
      clearChatState,
      chatInputRef,
    },
  }), [
    leftState.open,
    setLeftExpanded,
    toggleLeftPanel,
    openMobile,
    isMobile,
    surface,
    view,
    currentView,
    isRightExpanded,
    isFloatingOpen,
    floatingState,
    isViewVisible,
    setRightExpanded,
    showSidebar,
    showFloatingDock,
    toggleSidebarSurface,
    togglePanel,
    openFloating,
    collapseFloating,
    closeFloating,
    hidePanel,
    switchView,
    getChatGroup,
    setChatGroup,
    clearChatGroup,
    newChatRequest,
    requestNewChat,
    consumeNewChatRequest,
    isNewChatPending,
    completeNewChat,
    getPendingFloatingPrompt,
    queueFloatingPrompt,
    consumeFloatingPrompt,
    getChatDraft,
    setChatDraft,
    clearChatDraft,
    clearChatState,
  ]);

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
}

// ─── Fallback (when called outside LayoutProvider) ──────────────────────────

const noopFn = () => {};
const noopBoolFn = (_v: boolean) => {};
const noopViewFn = (_v?: RightPanelView) => {};
const noopStringFn = (_s: string) => {};
const noopReturnNull = (_s: string) => null;

const fallbackLeftSidebar: LayoutContextType["leftSidebar"] = {
  isExpanded: false,
  setIsExpanded: noopBoolFn,
  togglePanel: noopFn,
  openMobile: false,
  setOpenMobile: noopBoolFn,
  isMobile: false,
};

const fallbackRightPanel: LayoutContextType["rightPanel"] = {
  surface: "floating",
  view: "chat",
  currentView: "chat",
  isExpanded: false,
  isFloatingOpen: false,
  floatingState: "collapsed",
  isViewVisible: () => false,
  setIsExpanded: noopBoolFn,
  showSidebar: noopViewFn,
  showFloatingDock: noopViewFn,
  toggleSidebarSurface: noopViewFn,
  togglePanel: noopViewFn,
  openFloating: noopViewFn as LayoutContextType["rightPanel"]["openFloating"],
  collapseFloating: noopFn,
  closeFloating: noopFn,
  hidePanel: noopFn,
  switchView: noopFn as LayoutContextType["rightPanel"]["switchView"],
  getChatGroup: noopReturnNull,
  setChatGroup: noopStringFn as LayoutContextType["rightPanel"]["setChatGroup"],
  clearChatGroup: noopStringFn,
  newChatRequest: null,
  requestNewChat: (_s: string) => 0,
  consumeNewChatRequest: (_n: number) => {},
  isNewChatPending: (_s: string) => false,
  completeNewChat: noopStringFn,
  getPendingFloatingPrompt: noopReturnNull,
  queueFloatingPrompt: noopStringFn as LayoutContextType["rightPanel"]["queueFloatingPrompt"],
  consumeFloatingPrompt: noopReturnNull,
  getChatDraft: (_s: string) => "",
  setChatDraft: noopStringFn as LayoutContextType["rightPanel"]["setChatDraft"],
  clearChatDraft: noopStringFn,
  clearChatState: noopStringFn,
  chatInputRef: { current: null },
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Layout] useLayout called outside LayoutProvider");
    }
    return { leftSidebar: fallbackLeftSidebar, rightPanel: fallbackRightPanel };
  }
  return context;
}

export function useLeftSidebar() {
  return useLayout().leftSidebar;
}

export function useRightPanel() {
  return useLayout().rightPanel;
}
