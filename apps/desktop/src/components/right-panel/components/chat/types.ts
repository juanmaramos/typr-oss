export interface MessagePart {
  type:
    | "text"
    | "markdown"
    | "reasoning"
    | "diff-preview"
    | "inline-diff-summary"
    | "processing-steps"
    | "tool-execution";
  content: string;
  isComplete?: boolean;
  diffData?: {
    original: string;
    edited: string;
    reasoning: string;
    range: { from: number; to: number };
  };
  inlineDiffData?: {
    changeType: "addition" | "modification" | "removal";
    characterCount: number;
    preview: string;
    reasoning: string;
    status?: "pending" | "accepted" | "rejected"; // Track if user acted on this
  };
  processingSteps?: {
    id: string;
    label: string;
    status: "pending" | "active" | "completed" | "error";
  }[];
  toolData?: {
    type: string;
    status: "pending" | "running" | "completed" | "error";
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    errorMessage?: string;
  };
}

export interface Message {
  id: string;
  content: string;
  parts?: MessagePart[];
  isUser: boolean;
  timestamp: Date;
  sources?: Array<{ url: string; title?: string }>; // URLs cited in the message
}

export type ChatSession = {
  id: string;
  title: string;
  lastMessageDate: Date;
  messages: Message[];
};
