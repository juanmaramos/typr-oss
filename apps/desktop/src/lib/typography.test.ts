import postcss, { type Root } from "postcss";
import tailwindcss from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

import uiConfig from "../../../../packages/ui/tailwind.config";
import { cn } from "@typr/ui/lib/utils";
import { cn as desktopCn } from "./utils";

// Compare the public CSS contract to the pre-migration utilities, including the
// absence of line-height: adding Tailwind's usual default would resize rows.
const sizePairs = [
  ["text-[8px]", "text-ui-micro"],
  ["text-[9px]", "text-ui-fine"],
  ["text-[10px]", "text-ui-tiny"],
  ["text-[11px]", "text-ui-caption"],
  ["text-[12px]", "text-ui-label"],
  ["text-[13px]", "text-ui"],
  ["text-[14px]", "text-ui-control"],
  ["text-[15px]", "text-ui-body"],
  ["text-[16px]", "text-ui-heading"],
  ["text-[17px]", "text-ui-title"],
  ["text-[24px]", "text-ui-section"],
  ["text-[32px]", "text-ui-page"],
] as const;
const metricPairs = [
  ["leading-[22px]", "leading-ui-composer"],
  ["tracking-[0.14em]", "tracking-ui-eyebrow"],
] as const;

let css: Root;

beforeAll(async () => {
  const classes: string[] = [...sizePairs, ...metricPairs].flat();
  classes.push("sm:text-ui-tiny", "text-ui-body/6", "font-system", "text-sm");
  const result = await postcss([tailwindcss({
    presets: [uiConfig],
    content: [{ raw: classes.join(" ") }],
  })]).process("@tailwind utilities;", { from: undefined });
  css = result.root;
});

function declarations(className: string) {
  const selector = `.${className.replace(/[^\w-]/g, "\\$&")}`;
  const declarations: Record<string, string> = {};
  css.walkRules(rule => {
    if (rule.selector === selector) {
      rule.walkDecls(decl => { declarations[decl.prop] = decl.value; });
    }
  });
  expect(Object.keys(declarations).length, `Missing generated class: ${className}`).toBeGreaterThan(0);
  return declarations;
}

describe("shared typography CSS", () => {
  it.each(sizePairs)("preserves %s without adding a line height", (previous, shared) => {
    expect(declarations(shared)).toEqual(declarations(previous));
    expect(declarations(shared)).not.toHaveProperty("line-height");
  });

  it.each(metricPairs)("preserves %s", (previous, shared) => {
    expect(declarations(shared)).toEqual(declarations(previous));
  });

  it("supports responsive sizes and explicit slash line height", () => {
    expect(declarations("sm:text-ui-tiny")).toEqual({ "font-size": "10px" });
    expect(declarations("text-ui-body/6")).toEqual({ "font-size": "15px", "line-height": "1.5rem" });
  });

  it("keeps the tooltip's rem-based size and line height", () => {
    expect(declarations("text-sm")).toEqual({ "font-size": "0.875rem", "line-height": "1.25rem" });
    expect(declarations("font-system")).toEqual({ "font-family": "system-ui" });
  });
});

describe("shared typography class merging", () => {
  it("uses the canonical shared merger in desktop components", () => {
    expect(desktopCn).toBe(cn);
    expect(desktopCn("text-sm text-muted-foreground", "text-ui-caption"))
      .toBe("text-muted-foreground text-ui-caption");
  });

  it.each(sizePairs)("lets %s and %s override standard sizes without losing color", (_previous, shared) => {
    expect(cn("text-sm text-muted-foreground", shared)).toBe(`text-muted-foreground ${shared}`);
    expect(cn(shared, "text-lg text-foreground")).toBe("text-lg text-foreground");
    expect(cn(shared, "text-[18px]")).toBe("text-[18px]");
  });

  it("keeps responsive and important size scopes independent", () => {
    expect(cn("text-sm sm:text-lg text-muted-foreground", "text-ui sm:text-ui-caption"))
      .toBe("text-muted-foreground text-ui sm:text-ui-caption");
    expect(cn("!text-sm text-lg", "!text-ui-caption")).toBe("text-lg !text-ui-caption");
  });

  it("merges slash line heights and shared metrics like standard utilities", () => {
    expect(cn("text-sm leading-7 text-muted-foreground", "text-ui-body/6"))
      .toBe("text-muted-foreground text-ui-body/6");
    expect(cn("leading-6 tracking-wide font-sans", "leading-ui-composer tracking-ui-eyebrow font-system"))
      .toBe("leading-ui-composer tracking-ui-eyebrow font-system");
    expect(cn("leading-ui-composer tracking-ui-eyebrow font-system", "leading-7 tracking-tight font-mono"))
      .toBe("leading-7 tracking-tight font-mono");
  });
});
