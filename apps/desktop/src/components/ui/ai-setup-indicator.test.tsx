// @vitest-environment jsdom
import { AISetupIndicator } from "@/components/ui/ai-setup-indicator";
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => ({
  hasUsableModel: false,
  isLocalModelDownloading: false,
  isCheckingAvailability: false,
}));
vi.mock("@/hooks/useAIAvailability", () => ({ useAIAvailability: () => availability }));
vi.mock("@/hooks/usePlatform", () => ({ usePlatform: () => ({ supportsLocalModels: true }) }));
let container: HTMLDivElement;
let root: Root;
const i18n = setupI18n({ locale: "en", messages: { en: english, es: spanish } });
async function render() {
  await act(async () =>
    root.render(
      <I18nProvider i18n={i18n}>
        <AISetupIndicator />
      </I18nProvider>,
    )
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  availability.hasUsableModel = false;
  availability.isLocalModelDownloading = false;
  availability.isCheckingAvailability = false;
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("chat model setup status", () => {
  it("shows a quiet, announced next step when no model is available", async () => {
    await render();
    expect(container.querySelector("[role=status]")?.textContent).toContain("No local AI models available");
    expect(container.querySelector(".animate-ping")).toBeNull();
  });
  it("announces actual download activity and updates its translation", async () => {
    availability.isLocalModelDownloading = true;
    await render();
    expect(container.querySelector("[role=status]")?.textContent).toContain("Setting up offline AI models");
    expect(container.querySelector(".animate-ping")).not.toBeNull();
    await act(async () => i18n.activate("es"));
    expect(container.querySelector("[role=status]")?.textContent).toContain("Configurando modelos de IA sin conexión");
  });
  it("does not report chat as blocked while any configured model is usable", async () => {
    availability.hasUsableModel = true;
    availability.isLocalModelDownloading = true;
    await render();
    expect(container.querySelector("[role=status]")).toBeNull();
  });
  it("waits for availability checks before reporting a missing model", async () => {
    availability.isCheckingAvailability = true;
    await render();
    expect(container.querySelector("[role=status]")).toBeNull();
  });
});
