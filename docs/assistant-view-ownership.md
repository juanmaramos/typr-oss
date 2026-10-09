# Assistant view ownership

The right panel and floating assistant used to mount independent ChatView and TranscriptView trees for the same note. The active surface now owns the selected view. The sidebar keeps both tab children alive while it is active; the floating surface mounts only its selected view. This removes duplicate view instances without changing sidebar tab behavior.

Client UI state that must survive a surface handoff is stored by note session: chat drafts, selected group, history filter/open state, research mode, chat search text, and transcript search/replace text. The pending-created-group guard also survives the short interval before chat history refreshes. A persistent RightPanel owner handles transcript notifications and editor requests while the view is absent. Stream cancellation controllers are registered by session and operation identity, so a newly mounted ChatView can stop the current stream; an old finalizer cannot clear a different session's operation. The operation claim also remains held during async submission preflight to prevent duplicate submits after New Chat clears visible generating state. Native database preflight commands themselves are not cancellable. Document/selection edit work that returns before stream setup has no Stop signal, so the stream Stop regression test does not claim to cancel those phases.

The actual-ChatView handoff test remounts the component through LayoutProvider and verifies that its draft, active group, history filter, research mode, and message-search text return. The search handoff test checks the query and reapplied highlighting after remount, including when the transcript editor ref becomes ready after the search header mounts. The transcript ref test uses the real TranscriptEditor ref contract. Stream tests run the actual `useChatLogic` hook with mocked model/native boundaries and a deferred async stream; they verify the originating AbortSignal is aborted by Stop after the original view has unmounted and guard same-session submission during a deferred preflight. No model network call is made.

Measured parent mount counts changed from one ChatView plus one TranscriptView while collapsed to zero; an active sidebar remains at one of each. An expanded floating chat changed from two ChatViews plus one TranscriptView to one ChatView and zero TranscriptViews. An expanded floating transcript changed from one ChatView plus two TranscriptViews to zero ChatViews and one TranscriptView. In the sidebar, both different tabs remain mounted; in floating mode, only the selected tab mounts. The matrix uses actual RightPanel/ContextPane parent components but mocks ChatView and TranscriptView at their component boundary, so it measures ownership counts, not child render work. Actual nested editor mount time, scroll position, caret behavior, and undo preservation are not measured. Child-only scroll position and the transcript editor's selection, caret, and undo history reset when a surface change or collapse remounts that child. Per-note tests verify data/UI-state isolation across session keys.

The query fixture first performs five mocked database calls: one `listChatGroups`, three `listChatMessages`, and one `getSession`. Retaining the sidebar observer through a tab change adds none. On a sidebar-to-floating handoff, the old duplicate view and the new single floating view each add five calls. On floating-to-sidebar handoff or sidebar close-and-reopen, the old hidden-sidebar keep-alive path adds none while the new unmount-and-reopen path adds five (totals become two, six, and two). Collapsing and reopening the floating dock adds five calls in both layouts because the floating observer remounts with `staleTime: 0`. A 60-second scoped garbage-collection window allows cached data to appear immediately, but `staleTime: 0` still refreshes it. This is a mocked command-count comparison; native latency and end-to-end UI timing have not been benchmarked.

Run the focused evidence with:

```sh
pnpm -F @typr/desktop exec vitest run \
  src/components/right-panel/panel-lifecycle.test.tsx \
  src/components/right-panel/views/transcript-listener-lifecycle.test.tsx \
  src/components/right-panel/views/chat-improve-writing-lifecycle.test.tsx \
  src/components/right-panel/views/chat-view-remount.test.tsx \
  src/components/right-panel/hooks/chat-operation-lifecycle.test.tsx \
  src/components/right-panel/hooks/chat-query-lifecycle.test.tsx \
  src/components/right-panel/components/search/search-handoff.test.tsx
pnpm -F @typr/tiptap exec vitest run src/transcript/editor-ref.test.tsx
```
