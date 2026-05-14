/**
 * Type declarations for .po message files
 * The @lingui/vite-plugin handles these imports at runtime
 */
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}

