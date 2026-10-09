# Panel lifecycle measurements

The lifecycle matrix uses React 18 `createRoot` in jsdom with the real `ContextPane`, `RightPanel`, and `FloatingMeetingAssistant` parent components. ChatView and TranscriptView are mocked only at their component boundary to count mounts and unmounts. The dock and rail parents use a real React Query client with database commands mocked, so the query checks count fixture calls and cache behavior; they do not measure native database latency or device performance. Since child views are mocked in this matrix, their timer intervals and native listener work are not counted here; the transcript listener has a separate real-component test.

| Scenario | Sidebar ChatView | Sidebar TranscriptView | Floating ChatView | Floating TranscriptView |
| --- | ---: | ---: | ---: | ---: |
| Note route, floating surface collapsed | 1 | 1 | 0 | 0 |
| Floating chat expanded | 1 | 1 | 1 | 0 |
| Floating transcript expanded | 1 | 1 | 0 | 1 |
| Sidebar shown or hidden | 1 | 1 | 0 | 0 |
| Switch from note A to note B while in sidebar | 1 | 1 | — | — |
| Leave the note route | 0 | 0 | 0 | 0 |

The sidebar retains both tab children while hidden and while the floating surface is active. Expanding the floating surface therefore creates a second instance of whichever view is selected. Moving back to the sidebar removes the floating instance and preserves the sidebar instances. The test switches from note A to note B while the sidebar is selected; its two parent children stay mounted. It does not measure floating child counts during a route switch, and it mocks the nested transcript editor, so it cannot observe the editor's `key={sessionId}` remount.

The left context pane keeps one LeftSidebar instance through collapse and reopen; collapse sets its width to zero. The measurement supports treating this as an intentional keep-alive, not a duplicate mount.

The focus lifecycle test renders the real `LayoutProvider` with fake timers. Repeated focus requests coalesce to one timer; collapse, close, navigation, and provider unmount leave zero pending timers. The pre-fix close/unmount path left three recursive retry chains queued. Retries now stop after 10 retries separated by 50 ms, following the initial focus delay. The test confirms that an input mounted after 150 ms receives focus on the next 50 ms retry, and that opening the sidebar still focuses it after the 350 ms handoff delay.

Before the floating-query gate, each hidden dock and rail variant issued one `listChatGroups` call and one `listChatMessages` call on the sidebar surface, even though the variant returned no UI. With the gate, both fixture call counts are zero on the sidebar surface, then one call each after switching to floating. Returning to the sidebar and back to floating within the existing query stale times preserves the cached history summary and makes no additional calls.

The right-panel duplicate view mounts remain in place. ChatView owns local history/search/research UI flags and a per-instance inference AbortController without unmount cleanup, while drafts, active chat group IDs, and messages are shared outside the view. Unmounting those children needs a separate stream ownership and state-transfer fix before it is safe to claim the duplicate-view issue is resolved.

The mounted-view audit dispatched one `improveWritingRequested` event with same-session sidebar and floating ChatViews present. Before the guard, both handlers reached generation and produced two mocked requests. The new session-scoped busy guard reduces that path from two generation requests to one; the regression also confirms later requests work after the active one completes. Both components and their event listeners still remain mounted. Their per-instance abort controllers also mean the visible Stop action may not own the controller that started a request after a surface switch, so stream/Stop ownership remains open.

TranscriptView's native session listener now marks its effect disposed before cleanup. If native registration finishes after unmount, it immediately unregisters and ignores queued events; registration failures are logged. The focused DOM test covers normal unmount, late resolution, and rejection. This closes the late-registration leak. Two concurrently mounted transcript views can still each register a listener and process the same matching event, duplicating toast and invalidation work. The current fix cleans up each listener on unmount; it does not change the retained-view layout.

Verification commands and results:

- `pnpm -F @typr/desktop test` — passed, 10 files and 46 tests.
- `pnpm -F @typr/desktop typecheck` — passed.
- `pnpm -F @typr/desktop build` — passed. Vite reported stale Browserslist data, a PostCSS `from` warning, an unresolved `/icons/openrouter.svg` left for runtime resolution, and mixed static/dynamic imports for connector, Tauri path, and utils modules.
