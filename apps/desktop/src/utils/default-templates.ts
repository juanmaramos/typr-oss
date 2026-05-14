import type { Template } from "@typr/plugin-db";

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "default-meeting-notes",
    user_id: "system",
    title: "Meeting Notes",
    description: "General-purpose template for meeting notes with agenda, discussion points, and action items",
    sections: [
      {
        title: "Meeting Context",
        description: "Purpose of the meeting, key attendees, and any relevant background or prior decisions",
      },
      {
        title: "Discussion Points",
        description:
          "Key topics covered, decisions made, and reasoning behind them. Include specific numbers, dates, or commitments mentioned",
      },
      {
        title: "Action Items",
        description: "Tasks assigned with owners and deadlines. Mark unclear ownership as 'Owner TBD'",
      },
      {
        title: "Next Steps",
        description: "Follow-up actions, open questions to resolve, and next meeting details if discussed",
      },
    ],
    tags: ["general", "meeting", "agenda", "action-items", "builtin"],
  },
  {
    id: "default-one-on-one",
    user_id: "system",
    title: "1-on-1 Meeting",
    description: "Template for recurring one-on-one meetings between a manager and direct report",
    sections: [
      {
        title: "Check-in",
        description: "General wellbeing, morale, and anything on their mind outside of work tasks",
      },
      {
        title: "Progress & Updates",
        description:
          "Status on current projects, recent accomplishments, and what they've been working on since last time",
      },
      {
        title: "Blockers & Challenges",
        description:
          "Obstacles preventing progress, resource needs, or cross-team dependencies. Include any asks for help",
      },
      {
        title: "Growth & Development",
        description:
          "Career goals, skill development, feedback given or received, and learning opportunities discussed",
      },
      {
        title: "Action Items",
        description: "Commitments from both sides with owners and follow-up dates",
      },
    ],
    tags: ["general", "one-on-one", "1-on-1", "management", "feedback", "builtin"],
  },
  {
    id: "default-customer-call",
    user_id: "system",
    title: "Customer Call",
    description: "Template for customer calls, discovery sessions, and sales conversations",
    sections: [
      {
        title: "Customer Context",
        description:
          "Who they are, their company, role, and relevant background. Include team size and current tools if mentioned",
      },
      {
        title: "Needs & Pain Points",
        description:
          "Problems they're trying to solve, current workflow gaps, and what success looks like for them. Capture specific quotes",
      },
      {
        title: "Discussion Summary",
        description:
          "Key topics covered, questions asked, and responses to proposals or demos. Note enthusiasm level and objections",
      },
      {
        title: "Next Steps",
        description: "Agreed follow-up actions, timeline, stakeholders to loop in, and any materials to send",
      },
    ],
    tags: ["customer", "sales", "research", "discovery", "feedback", "builtin"],
  },
  {
    id: "default-job-interview",
    user_id: "system",
    title: "Interview Debrief",
    description: "Structured candidate assessment from interview conversations",
    sections: [
      {
        title: "Candidate Overview",
        description:
          "Name, role applied for, years of experience, current company, and a 2-3 sentence summary of their background",
      },
      {
        title: "Key Strengths",
        description:
          "Top 3-5 strengths demonstrated during the interview with specific examples or answers that support each",
      },
      {
        title: "Areas of Concern",
        description:
          "Gaps in experience, weak answers, or misalignments with the role. Be specific about what was lacking",
      },
      {
        title: "Culture & Team Fit",
        description:
          "Communication style, work preferences, collaboration approach, and alignment with team values discussed",
      },
      {
        title: "Recommendation",
        description: "Overall assessment: strong hire, hire, maybe, or pass. Include key reasoning and any conditions",
      },
    ],
    tags: ["general", "job-interview", "hiring", "candidate", "report", "builtin"],
  },
  {
    id: "default-project-planning",
    user_id: "system",
    title: "Project Kickoff",
    description: "Template for project kickoffs, planning sessions, and requirement discussions",
    sections: [
      {
        title: "Project Overview",
        description:
          "What we're building, why it matters, target users or stakeholders, and how success will be measured",
      },
      {
        title: "Scope & Requirements",
        description:
          "Features and deliverables discussed, what's in scope vs out of scope, and any constraints or dependencies identified",
      },
      {
        title: "Timeline & Milestones",
        description:
          "Key dates, phases, deadlines, and delivery expectations. Note any hard deadlines vs aspirational targets",
      },
      {
        title: "Risks & Open Questions",
        description:
          "Potential blockers, unknowns, technical risks, and questions that still need answers before proceeding",
      },
      {
        title: "Action Items",
        description: "Immediate next steps with owners, priorities, and target dates",
      },
    ],
    tags: ["general", "project", "planning", "requirements", "kickoff", "builtin"],
  },
];

export const isDefaultTemplate = (templateId: string): boolean => {
  return DEFAULT_TEMPLATES.some(t => t.id === templateId);
};

export const getDefaultTemplate = (templateId: string): Template | undefined => {
  return DEFAULT_TEMPLATES.find(t => t.id === templateId);
};
