// @vitest-environment jsdom
import { AISetupIndicator } from "@/components/ui/ai-setup-indicator";
import { messages as english } from "@/locales/en/messages.po";
import { messages as spanish } from "@/locales/es/messages.po";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ status: "needs-download", canStart: false, canRetry: false }));
const retry = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useAIAvailability", () => ({ useAIAvailability: () => ({ availability: state, retry }) }));
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
  state.status = "needs-download";
  state.canStart = false;
  state.canRetry = false;
  retry.mockClear();
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
    expect(container.querySelector("[role=status]")?.textContent).toContain("Download the selected model");
    expect(container.querySelector(".animate-ping")).toBeNull();
  });
  it("announces actual download activity and updates its translation", async () => {
    state.status = "downloading";
    await render();
    expect(container.querySelector("[role=status]")?.textContent).toContain("Downloading");
    expect(container.querySelector(".animate-ping")).not.toBeNull();
    await act(async () => i18n.activate("es"));
    expect(container.querySelector("[role=status]")?.textContent).toContain("Descargando");
  });
  it("does not report chat as blocked while any configured model is usable", async () => {
    state.canStart = true;
    state.status = "downloading";
    await render();
    expect(container.querySelector("[role=status]")).toBeNull();
  });
  it("waits for availability checks before reporting a missing model", async () => {
    state.status = "checking";
    await render();
    expect(container.querySelector("[role=status]")?.textContent).toContain("Checking model availability");
    expect(container.textContent).not.toContain("Download the selected");
  });
  it("shows a recoverable check failure rather than a missing-model message", async () => {
    state.status = "error";
    state.canRetry = true;
    await render();
    expect(container.textContent).toContain("Could not prepare the model");
    expect(container.textContent).not.toContain("Download the selected");
    await act(async () => container.querySelector("button")?.click());
    expect(retry).toHaveBeenCalledOnce();
  });
});
