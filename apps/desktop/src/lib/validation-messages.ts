import { i18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { z, type ZodErrorMap } from "zod";

// Called by Zod when validation runs, so changing language does not freeze schema messages.
export const localizedValidationErrorMap: ZodErrorMap = (issue, context) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === "undefined" ? i18n._(msg`Required`) : i18n._(msg`Enter a valid value.`) };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === "email") {
        return { message: i18n._(msg`Enter a valid email address.`) };
      }
      if (issue.validation === "url") {
        return { message: i18n._(msg`Enter a valid URL.`) };
      }
      return { message: i18n._(msg`Enter a valid value.`) };
    case z.ZodIssueCode.too_small: {
      const minimum = String(issue.minimum);
      const count = Number(issue.minimum);
      if (issue.type === "string") {
        if (issue.exact) {
          return { message: plural(count, { one: "Use exactly # character.", other: "Use exactly # characters." }) };
        }
        return {
          message: plural(issue.inclusive ? count : count + 1, {
            one: "Use at least # character.",
            other: "Use at least # characters.",
          }),
        };
      }
      if (issue.type === "array") {
        if (issue.exact) {
          return { message: plural(count, { one: "Select exactly # item.", other: "Select exactly # items." }) };
        }
        return {
          message: plural(issue.inclusive ? count : count + 1, {
            one: "Select at least # item.",
            other: "Select at least # items.",
          }),
        };
      }
      if (issue.type === "date") {
        const date = i18n.date(new Date(count));
        return {
          message: issue.inclusive
            ? i18n._(msg`Choose a date on or after ${date}.`)
            : i18n._(msg`Choose a date after ${date}.`),
        };
      }
      if (issue.exact) {
        return { message: i18n._(msg`Enter ${minimum}.`) };
      }
      return {
        message: issue.inclusive
          ? i18n._(msg`Enter a value greater than or equal to ${minimum}.`)
          : i18n._(msg`Enter a value greater than ${minimum}.`),
      };
    }
    case z.ZodIssueCode.too_big: {
      const maximum = String(issue.maximum);
      const count = Number(issue.maximum);
      if (issue.type === "string") {
        if (issue.exact) {
          return { message: plural(count, { one: "Use exactly # character.", other: "Use exactly # characters." }) };
        }
        return {
          message: plural(issue.inclusive ? count : count - 1, {
            one: "Use at most # character.",
            other: "Use at most # characters.",
          }),
        };
      }
      if (issue.type === "array") {
        if (issue.exact) {
          return { message: plural(count, { one: "Select exactly # item.", other: "Select exactly # items." }) };
        }
        return {
          message: plural(issue.inclusive ? count : count - 1, {
            one: "Select at most # item.",
            other: "Select at most # items.",
          }),
        };
      }
      if (issue.type === "date") {
        const date = i18n.date(new Date(count));
        return {
          message: issue.inclusive
            ? i18n._(msg`Choose a date on or before ${date}.`)
            : i18n._(msg`Choose a date before ${date}.`),
        };
      }
      if (issue.exact) {
        return { message: i18n._(msg`Enter ${maximum}.`) };
      }
      return {
        message: issue.inclusive
          ? i18n._(msg`Enter a value less than or equal to ${maximum}.`)
          : i18n._(msg`Enter a value less than ${maximum}.`),
      };
    }
    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_literal:
      return { message: i18n._(msg`Select a valid option.`) };
    case z.ZodIssueCode.invalid_date:
      return { message: i18n._(msg`Enter a valid date.`) };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: i18n._(msg`Remove unrecognized fields.`) };
    case z.ZodIssueCode.not_finite:
      return { message: i18n._(msg`Enter a finite number.`) };
    case z.ZodIssueCode.not_multiple_of: {
      const multiple = String(issue.multipleOf);
      return { message: i18n._(msg`Enter a multiple of ${multiple}.`) };
    }
    case z.ZodIssueCode.custom:
      return { message: issue.message ?? i18n._(msg`Enter a valid value.`) };
    default:
      return {
        message: context.defaultError === "Invalid input"
          ? i18n._(msg`Enter a valid value.`)
          : i18n._(msg`The value is invalid.`),
      };
  }
};

export function configureValidationMessages() {
  z.setErrorMap(localizedValidationErrorMap);
}
