export const PROFILE_AVATARS = [
  "marble-01",
  "marble-02",
  "marble-03",
  "marble-04",
  "marble-05",
  "marble-06",
  "marble-07",
  "marble-08",
] as const;

export const PROFILE_AVATAR_CHOICES = ["initials", ...PROFILE_AVATARS] as const;

export type ProfileAvatarChoice = typeof PROFILE_AVATAR_CHOICES[number];

export function isProfileAvatarChoice(value: unknown): value is ProfileAvatarChoice {
  return value === "initials" || PROFILE_AVATARS.some(id => id === value);
}

export function profileAvatarSource(choice: unknown): string | undefined {
  // Only bundled presets can become image URLs, including for hydrated preferences.
  return isProfileAvatarChoice(choice) && choice !== "initials" ? `/avatars/${choice}.svg` : undefined;
}

export function profileInitials(name: string | null | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) {
    return "?";
  }
  return (Array.from(parts[0])[0] + (parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : ""))
    .toLocaleUpperCase();
}
