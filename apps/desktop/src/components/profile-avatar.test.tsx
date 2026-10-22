// @vitest-environment jsdom

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileAvatarPicker } from "@/components/settings/components/profile-avatar-picker";
import { profileAvatarSource, profileInitials } from "@/lib/profile-avatar";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { useProfileAvatarStore } from "@/stores/profile-avatar";

// Node's experimental global storage can shadow jsdom's implementation.
vi.hoisted(() => {
  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
      clear: () => entries.clear(),
    },
  });
});

let container: HTMLDivElement;
let root: Root;
const i18n = setupI18n({ locale: "en", messages: { en, es } });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.localStorage.clear();
  useProfileAvatarStore.setState({ avatars: {} });
  i18n.activate("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderPicker(userId = "first-user") {
  await act(async () => {
    root.render(
      <I18nProvider i18n={i18n}>
        <ProfileAvatarPicker userId={userId} name="Juan M. Ramos" />
      </I18nProvider>,
    );
  });
}

function radio(value: string) {
  return container.querySelector<HTMLButtonElement>(`button[role="radio"][value="${value}"]`)!;
}

async function select(value: string) {
  await act(async () => radio(value).click());
}

async function restartPreferences() {
  const persisted = window.localStorage.getItem("typr-profile-avatars")!;
  await act(async () => {
    useProfileAvatarStore.setState({ avatars: {} });
    window.localStorage.setItem("typr-profile-avatars", persisted);
    await useProfileAvatarStore.persist.rehydrate();
  });
}

describe("profile avatar preferences", () => {
  it("defaults to initials and retains a selected preset after rehydration", async () => {
    await renderPicker();
    expect(radio("initials").getAttribute("aria-checked")).toBe("true");
    await select("marble-03");
    expect(radio("marble-03").getAttribute("aria-checked")).toBe("true");
    await restartPreferences();
    expect(radio("marble-03").getAttribute("aria-checked")).toBe("true");
    expect(useProfileAvatarStore.getState().avatars["first-user"]).toBe("marble-03");
  });

  it("keeps each profile's selection and allows returning to initials", async () => {
    await renderPicker();
    await select("marble-03");
    await renderPicker("second-user");
    expect(radio("initials").getAttribute("aria-checked")).toBe("true");
    await select("marble-07");
    await renderPicker();
    expect(radio("marble-03").getAttribute("aria-checked")).toBe("true");
    await select("initials");
    await restartPreferences();
    expect(radio("initials").getAttribute("aria-checked")).toBe("true");
    expect(useProfileAvatarStore.getState().avatars["second-user"]).toBe("marble-07");
  });

  it("preserves another window's saved profile and observes storage updates", async () => {
    await renderPicker();
    await select("marble-03");
    window.localStorage.setItem(
      "typr-profile-avatars",
      JSON.stringify({
        state: { avatars: { "first-user": "marble-03", "second-user": "marble-07" } },
        version: 0,
      }),
    );
    await select("marble-02");
    expect(useProfileAvatarStore.getState().avatars["second-user"]).toBe("marble-07");
    window.localStorage.setItem(
      "typr-profile-avatars",
      JSON.stringify({
        state: { avatars: { "first-user": "marble-08", "second-user": "marble-07" } },
        version: 0,
      }),
    );
    await act(async () =>
      window.dispatchEvent(Object.assign(new Event("storage"), {
        key: "typr-profile-avatars",
        storageArea: window.localStorage,
      }))
    );
    expect(radio("marble-08").getAttribute("aria-checked")).toBe("true");
  });

  it("refreshes choices changed before the picker mounts or while its window is inactive", async () => {
    useProfileAvatarStore.getState().setAvatar("first-user", "marble-01");
    const saveFromAnotherWindow = (choice: string) =>
      window.localStorage.setItem(
        "typr-profile-avatars",
        JSON.stringify({
          state: { avatars: { "first-user": choice } },
          version: 0,
        }),
      );
    saveFromAnotherWindow("marble-05");
    await renderPicker();
    expect(radio("marble-05").getAttribute("aria-checked")).toBe("true");
    saveFromAnotherWindow("marble-06");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(radio("marble-06").getAttribute("aria-checked")).toBe("true");
  });

  it("labels all choices in Spanish and prevents saving without an active profile", async () => {
    await act(async () => i18n.activate("es"));
    await renderPicker("");
    expect(container.textContent).toContain("Iniciales");
    expect(container.textContent).toContain("Avatar Marble 1");
    expect(radio("marble-01").disabled).toBe(true);
    useProfileAvatarStore.getState().setAvatar("", "marble-01");
    expect(useProfileAvatarStore.getState().avatars).toEqual({});
  });

  it("only resolves bundled image paths, with unknown choices falling back to initials", () => {
    expect(profileAvatarSource("marble-01")).toBe("/avatars/marble-01.svg");
    for (
      const value of [undefined, null, "initials", "marble-99", "https://example.test/avatar.svg", "../../private.svg"]
    ) {
      expect(profileAvatarSource(value)).toBeUndefined();
    }
  });

  it.each([
    ["  Juan   M. Ramos  ", "JR"],
    ["Ada", "A"],
    ["  ", "?"],
    [null, "?"],
    ["张 伟", "张伟"],
    ["𠮷田 太郎", "𠮷太"],
  ])("creates safe initials from %s", (name, expected) => {
    expect(profileInitials(name)).toBe(expected);
  });
});
