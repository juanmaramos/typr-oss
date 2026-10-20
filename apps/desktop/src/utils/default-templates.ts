import { i18n } from "@lingui/core";
import type { Template } from "@typr/plugin-db";

export const getDefaultTemplates = (): Template[] => [
  {
    id: "default-meeting-notes",
    user_id: "system",
    title: i18n._("Meeting Notes"),
    description: i18n._("General-purpose template for meeting notes with agenda, discussion points, and action items"),
    sections: [
      {
        title: i18n._("Meeting Context"),
        description: i18n._("Purpose of the meeting, key attendees, and any relevant background or prior decisions"),
      },
      {
        title: i18n._("Discussion Points"),
        description: i18n._(
          "Key topics covered, decisions made, and reasoning behind them. Include specific numbers, dates, or commitments mentioned",
        ),
      },
      {
        title: i18n._("Action Items"),
        description: i18n._("Tasks assigned with owners and deadlines. Mark unclear ownership as 'Owner TBD'"),
      },
      {
        title: i18n._("Next Steps"),
        description: i18n._("Follow-up actions, open questions to resolve, and next meeting details if discussed"),
      },
    ],
    tags: ["general", "meeting", "agenda", "action-items", "builtin"],
  },
  {
    id: "default-one-on-one",
    user_id: "system",
    title: i18n._("1-on-1 Meeting"),
    description: i18n._("Template for recurring one-on-one meetings between a manager and direct report"),
    sections: [
      {
        title: i18n._("Check-in"),
        description: i18n._("General wellbeing, morale, and anything on their mind outside of work tasks"),
      },
      {
        title: i18n._("Progress & Updates"),
        description: i18n._(
          "Status on current projects, recent accomplishments, and what they've been working on since last time",
        ),
      },
      {
        title: i18n._("Blockers & Challenges"),
        description: i18n._(
          "Obstacles preventing progress, resource needs, or cross-team dependencies. Include any asks for help",
        ),
      },
      {
        title: i18n._("Growth & Development"),
        description: i18n._(
          "Career goals, skill development, feedback given or received, and learning opportunities discussed",
        ),
      },
      {
        title: i18n._("Action Items"),
        description: i18n._("Commitments from both sides with owners and follow-up dates"),
      },
    ],
    tags: ["general", "one-on-one", "1-on-1", "management", "feedback", "builtin"],
  },
  {
    id: "default-customer-call",
    user_id: "system",
    title: i18n._("Customer Call"),
    description: i18n._("Template for customer calls, discovery sessions, and sales conversations"),
    sections: [
      {
        title: i18n._("Customer Context"),
        description: i18n._(
          "Who they are, their company, role, and relevant background. Include team size and current tools if mentioned",
        ),
      },
      {
        title: i18n._("Needs & Pain Points"),
        description: i18n._(
          "Problems they're trying to solve, current workflow gaps, and what success looks like for them. Capture specific quotes",
        ),
      },
      {
        title: i18n._("Discussion Summary"),
        description: i18n._(
          "Key topics covered, questions asked, and responses to proposals or demos. Note enthusiasm level and objections",
        ),
      },
      {
        title: i18n._("Next Steps"),
        description: i18n._("Agreed follow-up actions, timeline, stakeholders to loop in, and any materials to send"),
      },
    ],
    tags: ["customer", "sales", "research", "discovery", "feedback", "builtin"],
  },
  {
    id: "default-job-interview",
    user_id: "system",
    title: i18n._("Interview Debrief"),
    description: i18n._("Structured candidate assessment from interview conversations"),
    sections: [
      {
        title: i18n._("Candidate Overview"),
        description: i18n._(
          "Name, role applied for, years of experience, current company, and a 2-3 sentence summary of their background",
        ),
      },
      {
        title: i18n._("Key Strengths"),
        description: i18n._(
          "Top 3-5 strengths demonstrated during the interview with specific examples or answers that support each",
        ),
      },
      {
        title: i18n._("Areas of Concern"),
        description: i18n._(
          "Gaps in experience, weak answers, or misalignments with the role. Be specific about what was lacking",
        ),
      },
      {
        title: i18n._("Culture & Team Fit"),
        description: i18n._(
          "Communication style, work preferences, collaboration approach, and alignment with team values discussed",
        ),
      },
      {
        title: i18n._("Recommendation"),
        description: i18n._(
          "Overall assessment: strong hire, hire, maybe, or pass. Include key reasoning and any conditions",
        ),
      },
    ],
    tags: ["general", "job-interview", "hiring", "candidate", "report", "builtin"],
  },
  {
    id: "default-project-planning",
    user_id: "system",
    title: i18n._("Project Kickoff"),
    description: i18n._("Template for project kickoffs, planning sessions, and requirement discussions"),
    sections: [
      {
        title: i18n._("Project Overview"),
        description: i18n._(
          "What we're building, why it matters, target users or stakeholders, and how success will be measured",
        ),
      },
      {
        title: i18n._("Scope & Requirements"),
        description: i18n._(
          "Features and deliverables discussed, what's in scope vs out of scope, and any constraints or dependencies identified",
        ),
      },
      {
        title: i18n._("Timeline & Milestones"),
        description: i18n._(
          "Key dates, phases, deadlines, and delivery expectations. Note any hard deadlines vs aspirational targets",
        ),
      },
      {
        title: i18n._("Risks & Open Questions"),
        description: i18n._(
          "Potential blockers, unknowns, technical risks, and questions that still need answers before proceeding",
        ),
      },
      {
        title: i18n._("Action Items"),
        description: i18n._("Immediate next steps with owners, priorities, and target dates"),
      },
    ],
    tags: ["general", "project", "planning", "requirements", "kickoff", "builtin"],
  },
];

const DEFAULT_TEMPLATE_IDS = new Set([
  "default-meeting-notes",
  "default-one-on-one",
  "default-customer-call",
  "default-job-interview",
  "default-project-planning",
]);

export const isDefaultTemplate = (templateId: string): boolean => {
  return DEFAULT_TEMPLATE_IDS.has(templateId);
};

export const getDefaultTemplate = (templateId: string): Template | undefined => {
  return isDefaultTemplate(templateId) ? getDefaultTemplates().find(t => t.id === templateId) : undefined;
};

/** Resolve built-in copy when rendering, so cached templates follow locale changes. */
export const localizeDefaultTemplate = (template: Template): Template => {
  return getDefaultTemplate(template.id) ?? template;
};

export const getTemplateTagLabel = (template: Template, tag: string): string => {
  if (!isDefaultTemplate(template.id)) {
    return tag;
  }

  switch (tag) {
    case "general":
      return i18n._("General");
    case "meeting":
      return i18n._("Meeting");
    case "agenda":
      return i18n._("Agenda");
    case "action-items":
      return i18n._("Action items");
    case "builtin":
      return i18n._("Built-in");
    case "one-on-one":
      return i18n._("One-on-one");
    case "1-on-1":
      return i18n._("1-on-1");
    case "management":
      return i18n._("Management");
    case "feedback":
      return i18n._("Feedback");
    case "customer":
      return i18n._("Customer");
    case "sales":
      return i18n._("Sales");
    case "research":
      return i18n._("Research");
    case "discovery":
      return i18n._("Discovery");
    case "job-interview":
      return i18n._("Job interview");
    case "hiring":
      return i18n._("Hiring");
    case "candidate":
      return i18n._("Candidate");
    case "report":
      return i18n._("Report");
    case "project":
      return i18n._("Project");
    case "planning":
      return i18n._("Planning");
    case "requirements":
      return i18n._("Requirements");
    case "kickoff":
      return i18n._("Kickoff");
    default:
      return tag;
  }
};
