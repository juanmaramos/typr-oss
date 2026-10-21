const isEmptyHtml = (value?: string | null): boolean => {
  if (!value) {
    return true;
  }
  const normalized = value.replace(/\s+/g, "");
  return normalized === "" || normalized === "<p></p>";
};

export const isReusableDraftSession = (session: {
  title: string;
  calendar_event_id: string | null;
  raw_memo_html: string;
  enhanced_memo_html: string | null;
  pre_meeting_memo_html?: string | null;
  words: unknown[];
  conversations?: unknown[] | null;
  record_start: string | null;
  record_end: string | null;
}) => {
  const conversationCount = Array.isArray(session.conversations)
    ? session.conversations.length
    : 0;

  return !session.title.trim()
    && !session.calendar_event_id
    && isEmptyHtml(session.raw_memo_html)
    && isEmptyHtml(session.enhanced_memo_html)
    && isEmptyHtml(session.pre_meeting_memo_html)
    && session.words.length === 0
    && conversationCount === 0
    && !session.record_start
    && !session.record_end;
};
