# Transcript session-event ownership

The persistent `RightPanel` owns the native `session-event` listener for the active note route. Transcript views render and query session data, but do not register their own native listener. This keeps speaker-label notifications and session-query invalidation singular when sidebar and floating transcript views are both mounted.

The listener filters events to the active session, invalidates only that session's canonical query after an update, and cleans up when note navigation changes or leaves the route. It remains active while transcript surfaces collapse or select another view. The lifecycle integration test mounts the real `RightPanel` and `TranscriptView` together and covers duplicate registration, view changes, collapse, route navigation, late registration cleanup, and registration errors.
