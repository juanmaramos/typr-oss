# Panel lifecycle measurements

The ownership matrix uses React 18 `createRoot` in jsdom with the real `ContextPane`, `RightPanel`, and floating assistant parent components. ChatView and TranscriptView are mocked only at the parent boundary to count mounts and unmounts. Separate tests mount the real ChatView, transcript notification owner, and query hooks. Native database commands are mocked, so the measurements count fixture calls rather than native latency or device performance.

| Scenario | Sidebar ChatView | Sidebar TranscriptView | Floating ChatView | Floating TranscriptView |
| --- | ---: | ---: | ---: | ---: |
| Note route, floating surface collapsed | 0 | 0 | 0 | 0 |
| Sidebar selected, chat tab active | 1 | 1 | 0 | 0 |
| Sidebar selected, transcript tab active | 1 | 1 | 0 | 0 |
| Floating surface expanded, chat selected | 0 | 0 | 1 | 0 |
| Floating surface expanded, transcript selected | 0 | 0 | 0 | 1 |
| Switch note A to note B on the same route | 1 | 1 | — | — |
| Leave the note route | 0 | 0 | 0 | 0 |

Before this change, a collapsed panel retained one ChatView and one TranscriptView; the current collapsed state mounts zero. An active sidebar mounted one of each before and still mounts one of each. An expanded floating chat previously had two ChatViews and one TranscriptView; it now has one ChatView and no TranscriptView. An expanded floating transcript previously had one ChatView and two TranscriptViews; it now has no ChatView and one TranscriptView. The sidebar keeps its two tabs mounted while active, preserving their tab-local state. The note A-to-B row describes the parent mount count, not shared note data: drafts, selected groups, and other client UI state remain keyed by session.

Changing surfaces or collapsing the floating panel unmounts its child views. Session-owned drafts, active group, history filter, research choice, and search text survive that remount, but view-local scroll position and the transcript editor's undo history, selection, and caret do not. The mount matrix mocks nested children, so it does not measure TipTap editor mount cost, caret behavior, scroll restoration, or renderer wall time.

The LeftSideBar keeps one LeftSidebar instance through collapse and reopen; collapse sets its width to zero. Separately, the chat input focus test renders the real `LayoutProvider` with fake timers. Repeated focus requests coalesce to one timer; collapse, close, navigation, and provider unmount leave no pending retries. The test confirms that a late-mounted chat input receives focus on a retry and that opening the sidebar still focuses it after the handoff delay.

Chat query tests use app defaults (`staleTime: 0`) and mocked database commands. The first ChatView query set calls `listChatGroups` once, `listChatMessages` three times, and `getSession` once. Keeping a sidebar tab mounted across tab changes adds no calls. On a sidebar-to-floating handoff, the old duplicated layout added five calls for its extra floating ChatView; the current layout adds five when the floating view mounts after the sidebar observer unmounts. On floating-to-sidebar handoff or sidebar close-and-reopen, the old retained sidebar observer added no calls, while the current unmount-and-reopen adds five (totals become two group, six message, and two session calls). Collapsing and reopening the floating dock adds five calls in both layouts because its floating observer remounts with `staleTime: 0`. The scoped 60-second garbage-collection window lets cached data render immediately but does not suppress refetches with zero stale time. These are command counts only, not a timing benchmark.

The transcript listener test mounts its persistent RightPanel owner and mocks native registration. A matching processing, update, or error event produces one notification and the expected session invalidations across view and surface changes. It also covers navigation rebinds, late registration cleanup, and registration errors.

The earlier duplicate-view event guard test showed two mounted ChatViews both responding to one `improveWritingRequested` event and starting two mocked generations. The persistent RightPanel request owner now captures the event while ChatView is absent, activates chat, and lets the mounted view consume it once. The registry-backed stream Stop test likewise verifies that a replacement view can stop the stream started by the view that has since unmounted. Stop cancellation is tied to the accepted Ask generation; whole-document Edit and selection-based edit work do not observe this signal and are not claimed to be cancellable by Stop.

Focused lifecycle coverage lives in `apps/desktop/src/components/right-panel/panel-lifecycle.test.tsx`, `apps/desktop/src/components/right-panel/views/transcript-listener-lifecycle.test.tsx`, `apps/desktop/src/components/right-panel/views/chat-improve-writing-lifecycle.test.tsx`, `apps/desktop/src/components/right-panel/views/chat-view-remount.test.tsx`, `apps/desktop/src/components/right-panel/hooks/chat-operation-lifecycle.test.tsx`, and `apps/desktop/src/components/right-panel/hooks/chat-query-lifecycle.test.tsx`. Search and editor-ref handoff coverage lives in `apps/desktop/src/components/right-panel/components/search/search-handoff.test.tsx` and `packages/tiptap/src/transcript/editor-ref.test.tsx`.
