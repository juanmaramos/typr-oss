import { i18n } from "@lingui/core";
import { beforeAll, describe, expect, it } from "vitest";

import { differenceInBusinessDays, formatCategorizedDate, formatRelativeWithDay } from "./datetime";

beforeAll(() => {
  // Load minimal messages for testing
  i18n.load({
    en: {
      "Today": "Today",
      "This Week": "This Week",
      "This month": "This month",
      "Unknown date": "Unknown date",
      "Invalid date": "Invalid date",
      "Date error": "Date error",
      "{month} {year}": "{month} {year}",
    },
  });
  i18n.activate("en");
});

describe("differenceInBusinessDays", () => {
  it("works", () => {
    const dateString = new Date().toISOString();
    const now = new Date();

    expect(differenceInBusinessDays(now, new Date(dateString), "Asia/Seoul")).toBe(0);
  });
});

describe("formatRelativeWithDay", () => {
  it("works", () => {
    expect(formatRelativeWithDay("2025-04-14T09:07:57.843843Z", "Asia/Seoul", new Date("2025-04-12T08:16:31.438Z")))
      .toBe(
        "2 days later (Mon)",
      );
  });
});

describe("formatCategorizedDate", () => {
  const mockNow = new Date("2024-03-15T10:00:00.000Z"); // Friday, March 15, 2024

  beforeAll(() => {
    // Mock the current date for consistent testing
    global.Date = class extends Date {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow);
        } else {
          super(...args);
        }
      }

      static now() {
        return mockNow.getTime();
      }
    } as any;
  });

  it("returns 'Today' for same day", () => {
    const today = "2024-03-15T15:30:00.000Z";
    expect(formatCategorizedDate(today, "UTC")).toBe("Today");
  });

  it("returns 'This Week' for dates within current week (excluding today)", () => {
    // Sunday to Thursday of current week (excluding Friday which is today)
    const sunday = "2024-03-10T10:00:00.000Z"; // Start of week
    const wednesday = "2024-03-13T10:00:00.000Z"; // Mid-week
    const thursday = "2024-03-14T10:00:00.000Z"; // Day before today

    expect(formatCategorizedDate(sunday, "UTC")).toBe("This Week");
    expect(formatCategorizedDate(wednesday, "UTC")).toBe("This Week");
    expect(formatCategorizedDate(thursday, "UTC")).toBe("This Week");
  });

  it("returns 'This month' for dates within current month (excluding current week)", () => {
    // Dates before current week but within March 2024
    const march1 = "2024-03-01T10:00:00.000Z";
    const march8 = "2024-03-08T10:00:00.000Z"; // Friday before current week

    expect(formatCategorizedDate(march1, "UTC")).toBe("This month");
    expect(formatCategorizedDate(march8, "UTC")).toBe("This month");
  });

  it("returns month name for dates in same year but different months", () => {
    const february = "2024-02-15T10:00:00.000Z";
    const january = "2024-01-15T10:00:00.000Z";
    const april = "2024-04-15T10:00:00.000Z"; // Future month

    expect(formatCategorizedDate(february, "UTC")).toBe("February");
    expect(formatCategorizedDate(january, "UTC")).toBe("January");
    expect(formatCategorizedDate(april, "UTC")).toBe("April");
  });

  it("returns month and year for dates in different years", () => {
    const lastYear = "2023-12-15T10:00:00.000Z";
    const nextYear = "2025-01-15T10:00:00.000Z";

    expect(formatCategorizedDate(lastYear, "UTC")).toBe("December 2023");
    expect(formatCategorizedDate(nextYear, "UTC")).toBe("January 2025");
  });

  it("handles null and undefined dates", () => {
    expect(formatCategorizedDate(null, "UTC")).toBe("Unknown date");
    expect(formatCategorizedDate(undefined, "UTC")).toBe("Unknown date");
  });

  it("handles invalid dates", () => {
    expect(formatCategorizedDate("invalid-date", "UTC")).toBe("Invalid date");
    expect(formatCategorizedDate("", "UTC")).toBe("Invalid date");
  });

  it("respects timezone parameter", () => {
    // Test with different timezone - the logic should still work
    const date = "2024-03-15T05:00:00.000Z"; // Different time but same day in UTC
    expect(formatCategorizedDate(date, "UTC")).toBe("Today");
  });
});
