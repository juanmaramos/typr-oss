import type { Session } from "@typr/plugin-db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the plugin-db commands before importing stores
vi.mock("@typr/plugin-db", () => ({
  commands: {
    upsertSession: vi.fn(async (session: Session) => session),
    getSession: vi.fn(async () => null),
  },
}));

import { commands as dbCommands } from "@typr/plugin-db";
import { createSessionStore } from "./session";
import { createSessionsStore } from "./sessions";

const mockUpsert = vi.mocked(dbCommands.upsertSession);
const mockGetSession = vi.mocked(dbCommands.getSession);

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    created_at: "2025-01-01T00:00:00Z",
    visited_at: "2025-01-01T00:00:00Z",
    user_id: "user-1",
    calendar_event_id: null,
    title: "",
    raw_memo_html: "",
    enhanced_memo_html: null,
    auto_enhanced_memo_html: null,
    words: [],
    record_start: null,
    record_end: null,
    pre_meeting_memo_html: null,
    source_type: "manual",
    source_metadata: null,
    space_id: null,
    needs_enhance: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createSessionStore", () => {
  describe("persistSession — shared debounce", () => {
    it("coalesces multiple rapid calls into a single DB write", async () => {
      const session = makeSession();
      mockGetSession.mockResolvedValue(session);

      const store = createSessionStore(session);

      // Call persistSession 5 times rapidly (no force)
      store.getState().persistSession(makeSession({ title: "v1" }));
      store.getState().persistSession(makeSession({ title: "v2" }));
      store.getState().persistSession(makeSession({ title: "v3" }));
      store.getState().persistSession(makeSession({ title: "v4" }));
      store.getState().persistSession(makeSession({ title: "v5" }));

      // Before debounce fires: no upsert calls yet (only getSession reads)
      expect(mockUpsert).not.toHaveBeenCalled();

      // Advance past debounce window
      await vi.advanceTimersByTimeAsync(100);

      // Shared debounce should coalesce to a single write with the last data
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "v5" }),
      );
    });

    it("force: true bypasses debounce and writes immediately", async () => {
      const session = makeSession();
      mockGetSession.mockResolvedValue(session);

      const store = createSessionStore(session);

      await store.getState().persistSession(makeSession({ title: "forced" }), true);

      // Should write immediately without waiting for debounce
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "forced" }),
      );
    });

    it("preserves DB-owned needs_enhance when persisting stale session state", async () => {
      const staleSession = makeSession({ needs_enhance: true });
      const claimedDbSession = makeSession({ needs_enhance: false });
      mockGetSession.mockResolvedValue(claimedDbSession);

      const store = createSessionStore(staleSession);

      await store.getState().persistSession(
        makeSession({
          enhanced_memo_html: "<p>Streaming summary</p>",
          needs_enhance: true,
        }),
        true,
      );

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          enhanced_memo_html: "<p>Streaming summary</p>",
          needs_enhance: false,
        }),
      );
    });
  });

  describe("refresh", () => {
    it("pulls latest data from DB into the store", async () => {
      const session = makeSession({ title: "original" });
      const store = createSessionStore(session);

      expect(store.getState().session.title).toBe("original");

      // Simulate DB having updated data
      mockGetSession.mockResolvedValue(
        makeSession({ title: "updated from DB", enhanced_memo_html: "<p>Summary</p>" }),
      );

      await store.getState().refresh();

      expect(store.getState().session.title).toBe("updated from DB");
      expect(store.getState().session.enhanced_memo_html).toBe("<p>Summary</p>");
    });
  });

  describe("updateEnhancedNote", () => {
    it("sets enhanced content and switches to enhanced view", () => {
      const session = makeSession({ enhanced_memo_html: null });
      const store = createSessionStore(session);

      expect(store.getState().showRaw).toBe(true);

      store.getState().updateEnhancedNote("<p>AI Summary</p>");

      expect(store.getState().session.enhanced_memo_html).toBe("<p>AI Summary</p>");
      expect(store.getState().showRaw).toBe(false);
    });
  });

  describe("restoreEnhancedNote", () => {
    it("restores enhanced content and persists immediately", async () => {
      const dbSession = makeSession({ enhanced_memo_html: "<p>Previous summary</p>" });
      mockGetSession.mockResolvedValue(dbSession);

      const store = createSessionStore(
        makeSession({ enhanced_memo_html: "<p>Partial draft</p>" }),
      );

      await store.getState().restoreEnhancedNote("<p>Previous summary</p>", false);

      expect(store.getState().session.enhanced_memo_html).toBe("<p>Previous summary</p>");
      expect(store.getState().showRaw).toBe(false);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ enhanced_memo_html: "<p>Previous summary</p>" }),
      );
    });

    it("can restore to no AI notes and switch back to private notes", async () => {
      const dbSession = makeSession({ enhanced_memo_html: null });
      mockGetSession.mockResolvedValue(dbSession);

      const store = createSessionStore(
        makeSession({ enhanced_memo_html: "<p>Partial draft</p>" }),
      );

      await store.getState().restoreEnhancedNote(null, true);

      expect(store.getState().session.enhanced_memo_html).toBeNull();
      expect(store.getState().showRaw).toBe(true);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ enhanced_memo_html: null }),
      );
    });
  });
});

describe("createSessionsStore", () => {
  describe("insert", () => {
    it("creates a new store for an unknown session ID", () => {
      const sessionsStore = createSessionsStore();
      const session = makeSession({ id: "new-session", title: "Meeting 1" });

      sessionsStore.getState().insert(session);

      const store = sessionsStore.getState().sessions["new-session"];
      expect(store).toBeDefined();
      expect(store.getState().session.title).toBe("Meeting 1");
    });

    it("overwrites existing store when called via insert (sessions store behavior)", () => {
      const sessionsStore = createSessionsStore();
      const session = makeSession({ id: "s1", title: "Original", enhanced_memo_html: "<p>Content</p>" });

      sessionsStore.getState().insert(session);

      // insert() with different data DOES overwrite (this is correct for explicit updates)
      const staleData = makeSession({ id: "s1", title: "", enhanced_memo_html: null });
      sessionsStore.getState().insert(staleData);

      const store = sessionsStore.getState().sessions["s1"];
      expect(store.getState().session.enhanced_memo_html).toBeNull();
    });
  });

  describe("race condition — notes-list refetch should not overwrite", () => {
    it("existing store retains enhanced content when notes-list only inserts new stores", () => {
      const sessionsStore = createSessionsStore();

      // Step 1: Session created and enhanced content set (simulates enhancement completion)
      const session = makeSession({ id: "meeting-1" });
      sessionsStore.getState().insert(session);
      const store = sessionsStore.getState().sessions["meeting-1"];
      store.getState().updateEnhancedNote("<p>AI Summary of Meeting</p>");

      expect(store.getState().session.enhanced_memo_html).toBe("<p>AI Summary of Meeting</p>");

      // Step 2: Simulate notes-list refetch behavior (Fix 3 pattern)
      // The refetch returns stale DB data without enhanced content
      const staleDbData = makeSession({ id: "meeting-1", enhanced_memo_html: null });

      // With Fix 3: only insert if store doesn't exist
      const sessions = sessionsStore.getState().sessions;
      if (!sessions[staleDbData.id]) {
        sessionsStore.getState().insert(staleDbData);
      }

      // Enhanced content should be preserved
      expect(store.getState().session.enhanced_memo_html).toBe("<p>AI Summary of Meeting</p>");
    });

    it("new sessions from refetch are still created correctly", () => {
      const sessionsStore = createSessionsStore();

      // Existing session
      sessionsStore.getState().insert(makeSession({ id: "existing" }));

      // Refetch returns existing + new session
      const refetchResults = [
        makeSession({ id: "existing" }),
        makeSession({ id: "new-from-refetch", title: "New Meeting" }),
      ];

      // Apply Fix 3 pattern
      const sessions = sessionsStore.getState().sessions;
      refetchResults.forEach((session) => {
        if (!sessions[session.id]) {
          sessionsStore.getState().insert(session);
        }
      });

      // New session should be created
      expect(sessionsStore.getState().sessions["new-from-refetch"]).toBeDefined();
      expect(
        sessionsStore.getState().sessions["new-from-refetch"].getState().session.title,
      ).toBe("New Meeting");

      // Existing session should not be touched
      expect(sessionsStore.getState().sessions["existing"]).toBeDefined();
    });
  });
});
