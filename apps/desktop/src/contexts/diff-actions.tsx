import { createContext, useCallback, useContext, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface DiffActionsContextType {
  registerHandlers: (handlers: { onAccept: () => void; onReject: () => void }) => void;
  unregisterHandlers: () => void;
}

const DiffActionsContext = createContext<DiffActionsContextType | null>(null);

export function DiffActionsProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<{ onAccept: () => void; onReject: () => void } | null>(null);

  const registerHandlers = useCallback((handlers: { onAccept: () => void; onReject: () => void }) => {
    handlersRef.current = handlers;
  }, []);

  const unregisterHandlers = useCallback(() => {
    handlersRef.current = null;
  }, []);

  // Cmd+Enter / Ctrl+Enter to accept changes
  useHotkeys(
    "mod+enter",
    (event) => {
      event.preventDefault();
      if (handlersRef.current?.onAccept) {
        handlersRef.current.onAccept();
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  // Cmd+Backspace / Ctrl+Backspace to reject changes
  useHotkeys(
    "mod+backspace",
    (event) => {
      event.preventDefault();
      if (handlersRef.current?.onReject) {
        handlersRef.current.onReject();
      }
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );

  return (
    <DiffActionsContext.Provider value={{ registerHandlers, unregisterHandlers }}>
      {children}
    </DiffActionsContext.Provider>
  );
}

export function useDiffActions() {
  const context = useContext(DiffActionsContext);
  if (!context) {
    throw new Error("useDiffActions must be used within DiffActionsProvider");
  }
  return context;
}
