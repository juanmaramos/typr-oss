import { readFileSync } from "node:fs";
import postcss, { type Root } from "postcss";
import tailwindcss from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig";
import resolveConfig from "tailwindcss/resolveConfig";
import { beforeAll, describe, expect, it } from "vitest";

import { radii, radiusScale } from "@typr/ui/lib/radii";
import { cn } from "@typr/ui/lib/utils";
import uiConfig from "../../../../packages/ui/tailwind.config";

let css: Root;
const roles = Object.keys(radii) as Array<keyof typeof radii>;
beforeAll(async () => {
  const result = await postcss([tailwindcss({
    presets: [uiConfig],
    content: [{ raw: [...roles.map(role => `rounded-${role}`), "rounded-l-control", "sm:rounded-surface"].join(" ") }],
  })]).process("@tailwind utilities;", { from: undefined });
  css = result.root;
});

function declarations(selector: string) {
  const result: Record<string, string> = {};
  css.walkRules(rule => {
    if (rule.selector === selector) {
      rule.walkDecls(decl => {
        result[decl.prop] = decl.value;
      });
    }
  });
  return result;
}

describe("shared radius roles", () => {
  it.each(roles)("generates a token-backed %s utility", role => {
    expect(declarations(`.rounded-${role}`)).toEqual({ "border-radius": radii[role] });
  });

  it("inherits the same complete scale in desktop without Tailwind adding sizes", () => {
    expect(resolveConfig(uiConfig).theme.borderRadius).toEqual(radiusScale);
    expect(resolveConfig(loadConfig(new URL("../../tailwind.config.ts", import.meta.url).pathname)).theme.borderRadius)
      .toEqual(radiusScale);
    expect(new Set(Object.values(radiusScale))).toEqual(new Set([...Object.values(radii), "0"]));
  });

  it("supports responsive and directional shape roles", () => {
    expect(declarations(".rounded-l-control")).toEqual({
      "border-top-left-radius": radii.control,
      "border-bottom-left-radius": radii.control,
    });
    expect(declarations(".sm\\:rounded-surface")).toEqual({ "border-radius": radii.surface });
  });

  it("derives corner roles from one base in both themes", () => {
    const source = postcss.parse(
      readFileSync(new URL("../../../../packages/ui/src/styles/globals.css", import.meta.url), "utf8"),
    );
    const values: Record<string, string> = {};
    source.walkDecls(/^--radius/, decl => {
      expect(values).not.toHaveProperty(decl.prop);
      values[decl.prop] = decl.value;
    });
    expect(values).toEqual({
      "--radius": "0.5rem",
      "--radius-compact": "calc(var(--radius) * 0.5)",
      "--radius-control": "var(--radius)",
      "--radius-surface": "calc(var(--radius) * 1.5)",
      "--radius-composer": "calc(var(--radius) * 3)",
      "--radius-floating": "calc(var(--radius) * 4)",
      "--radius-pill": "9999px",
    });
  });

  it("merges semantic and conventional names in either order", () => {
    expect(cn("rounded-md border", "rounded-floating")).toBe("border rounded-floating");
    expect(cn("rounded-floating", "rounded-md")).toBe("rounded-md");
    expect(cn("rounded-surface", "rounded-control")).toBe("rounded-control");
  });

  it("preserves joined controls, responsive scopes and important overrides", () => {
    expect(cn("rounded-control", "rounded-l-none")).toBe("rounded-control rounded-l-none");
    expect(cn("rounded-l-control", "rounded-l-none")).toBe("rounded-l-none");
    expect(cn("rounded-lg sm:rounded-control", "rounded-surface")).toBe("sm:rounded-control rounded-surface");
    expect(cn("rounded-control", "!rounded-surface")).toBe("rounded-control !rounded-surface");
  });
});
