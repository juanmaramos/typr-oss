-- Migration slot retained for compatibility.
-- Source metadata schema recovery is now handled by non-destructive startup patching.
PRAGMA user_version = user_version;
