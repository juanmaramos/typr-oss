// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider, useLingui } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TranscriptPreviews } from "@/components/right-panel/components/transcript-previews";
import { getShortcutById, getShortcutsByCategory, shortcutsData } from "@/data/shortcuts";
import { Spinner } from "@typr/ui/components/ui/spinner";
import { CustomToast } from "@typr/ui/components/ui/toast";
import { messages as enMessages } from "../locales/en/messages.po";
import { messages as esMessages } from "../locales/es/messages.po";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function ShortcutDescription() {
  const { i18n } = useLingui();
  return <p>{i18n._(getShortcutById("toggle-assistant")!.description)}</p>;
}

describe("desktop and shared UI localization", () => {
  it("updates shared accessibility labels and shortcut copy when the locale changes", async () => {
    const i18n = setupI18n({ locale: "en", messages: { en: enMessages, es: esMessages } });
    await act(async () => {
      root.render(
        <I18nProvider i18n={i18n}>
          <Spinner />
          <CustomToast id="localization-test" title="Typr" dismissible />
          <ShortcutDescription />
        </I18nProvider>,
      );
    });
    expect(container.querySelector("[role=\"status\"]")?.getAttribute("aria-label")).toBe("Loading");
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Dismiss");
    expect(container.querySelector("p")?.textContent).toBe("Toggle assistant panel");

    await act(async () => i18n.activate("es"));
    expect(container.querySelector("[role=\"status\"]")?.getAttribute("aria-label")).toBe("Cargando");
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Descartar");
    expect(container.querySelector("p")?.textContent).toBe("Alternar panel del asistente");

    await act(async () => i18n.activate("en"));
    expect(container.querySelector("[role=\"status\"]")?.getAttribute("aria-label")).toBe("Loading");
    expect(container.querySelector("p")?.textContent).toBe("Toggle assistant panel");
  });

  it("localizes transient transcription status without altering recognized English or Spanish speech", async () => {
    const i18n = setupI18n({ locale: "en", messages: { en: enMessages, es: esMessages } });
    const previews = {
      mic: [{ text: "Hello there", speaker: null, confidence: null, start_ms: null, end_ms: null }],
      speaker: [{ text: "Hola a todos", speaker: null, confidence: null, start_ms: null, end_ms: null }],
    };
    await act(async () =>
      root.render(
        <I18nProvider i18n={i18n}>
          <TranscriptPreviews previews={previews} />
        </I18nProvider>,
      )
    );
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Interim transcription");
    expect(container.textContent).toContain("Live preview · may change");
    await act(async () => i18n.activate("es"));
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe("Transcripción provisional");
    expect(container.textContent).toContain("Vista previa en directo · puede cambiar");
    expect(container.textContent).toContain("Hello there");
    expect(container.textContent).toContain("Hola a todos");
  });

  it("includes Spanish messages for every registered shortcut and category", () => {
    const en = setupI18n({ locale: "en", messages: { en: enMessages } });
    const es = setupI18n({ locale: "es", messages: { es: esMessages } });
    const descriptors = [
      ...shortcutsData.map(shortcut => shortcut.description),
      ...getShortcutsByCategory().map(group => group.category),
    ];
    for (const descriptor of descriptors) {
      expect(es._(descriptor), `Missing Spanish translation for ${en._(descriptor)}`).not.toBe(en._(descriptor));
    }
  });
});
