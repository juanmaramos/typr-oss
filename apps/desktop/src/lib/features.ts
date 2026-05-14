export const FEATURES = {
  PARTICIPANTS_SYSTEM: false,
  CONTACTS_ACCESS_UI: false,
  SHOW_PRIMARY_RAIL: false,
  ENABLE_LEGACY_FLOATING_RAIL_VARIANT: false,
  ENABLE_AGENT_WRITING_ASSISTANT: false,
} as const;

// Helper functions for cleaner imports
export const isParticipantsSystemEnabled = () => FEATURES.PARTICIPANTS_SYSTEM;
export const isContactsAccessUIEnabled = () => FEATURES.CONTACTS_ACCESS_UI;
