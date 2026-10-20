import { messages as enMessages } from "@/locales/en/messages";
import { messages as esMessages } from "@/locales/es/messages";
import { i18n } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { configureValidationMessages } from "./validation-messages";

const originalErrorMap = z.getErrorMap();
const emailSchema = z.string().email();
const errorMessage = (result: z.SafeParseReturnType<unknown, unknown>) =>
  result.success ? "" : result.error.issues[0].message;

describe("localized form validation", () => {
  beforeEach(() => {
    i18n.load({ en: enMessages, es: esMessages });
    i18n.activate("en");
    configureValidationMessages();
  });

  afterEach(() => {
    z.setErrorMap(originalErrorMap);
    i18n.activate("en");
  });

  it("uses the current locale when validating an existing schema", () => {
    const english = errorMessage(emailSchema.safeParse("invalid"));
    expect(english).toBe("Enter a valid email address.");
    i18n.activate("es");
    const spanish = errorMessage(emailSchema.safeParse("invalid"));
    expect(spanish).not.toBe(english);
    expect(spanish).not.toMatch(/Enter a valid/);
  });

  it("keeps explicit schema messages intact", () => {
    i18n.activate("es");
    const customSchema = z.string().email({ message: "custom validation detail" });
    expect(errorMessage(customSchema.safeParse("invalid"))).toBe("custom validation detail");
  });

  it("honors exact lengths and singular counts", () => {
    expect(errorMessage(z.string().length(3).safeParse("a"))).toBe("Use exactly 3 characters.");
    expect(errorMessage(z.string().length(3).safeParse("long"))).toBe("Use exactly 3 characters.");
    expect(errorMessage(z.string().min(1).safeParse(""))).toBe("Use at least 1 character.");
    expect(errorMessage(z.array(z.string()).length(1).safeParse([]))).toBe("Select exactly 1 item.");
  });

  it("formats constraint values in Spanish", () => {
    i18n.activate("es");
    const message = errorMessage(z.string().min(3).safeParse("a"));
    expect(message).toContain("3");
    expect(message).not.toMatch(/Use at least|characters/);
  });

  it("localizes required fields and includes length limits", () => {
    expect(errorMessage(z.string().safeParse(undefined))).toBe("Required");
    expect(errorMessage(z.string().min(3).safeParse("a"))).toBe("Use at least 3 characters.");
  });
});
