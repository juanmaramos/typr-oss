import { i18n } from "@lingui/core";
import { afterEach, describe, expect, it } from "vitest";

import {
  getDefaultTemplate,
  getDefaultTemplates,
  getTemplateTagLabel,
  localizeDefaultTemplate,
} from "./default-templates";

const english = {
  "Meeting Notes": "Meeting Notes",
  "Meeting Context": "Meeting Context",
};
const spanish = {
  "Meeting Notes": "Notas de reunión",
  "Meeting Context": "Contexto de la reunión",
  "Meeting": "Reunión",
};

i18n.load({ en: english, es: spanish });

afterEach(() => i18n.activate("en"));

describe("built-in template localization", () => {
  it("resolves cached template titles and sections in the active locale without changing identifiers", () => {
    i18n.activate("en");
    const original = getDefaultTemplate("default-meeting-notes")!;
    expect(original.title).toBe("Meeting Notes");

    i18n.activate("es");
    const localized = localizeDefaultTemplate(original);
    expect(localized.title).toBe("Notas de reunión");
    expect(localized.sections[0].title).toBe("Contexto de la reunión");
    expect(localized.id).toBe(original.id);
    expect(localized.tags).toEqual(original.tags);
    expect(original.title).toBe("Meeting Notes");
    expect(getTemplateTagLabel(localized, "meeting")).toBe("Reunión");

    i18n.activate("en");
    expect(localizeDefaultTemplate(localized).title).toBe("Meeting Notes");
    expect(getDefaultTemplates()).toHaveLength(5);
  });

  it("preserves custom template contents even when they match a built-in message", () => {
    i18n.activate("es");
    const custom = { ...getDefaultTemplate("default-meeting-notes")!, id: "custom-template", title: "Meeting Notes" };
    expect(localizeDefaultTemplate(custom)).toBe(custom);
    expect(getTemplateTagLabel(custom, "meeting")).toBe("meeting");
  });
});
