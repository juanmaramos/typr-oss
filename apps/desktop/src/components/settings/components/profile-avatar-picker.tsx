import { Trans, useLingui } from "@lingui/react/macro";
import { Check } from "lucide-react";
import { useId } from "react";

import { ProfileAvatar } from "@/components/profile-avatar";
import { isProfileAvatarChoice, PROFILE_AVATAR_CHOICES } from "@/lib/profile-avatar";
import { useProfileAvatarChoice, useProfileAvatarStore } from "@/stores/profile-avatar";
import { Label } from "@typr/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@typr/ui/components/ui/radio-group";

export function ProfileAvatarPicker({ userId, name }: { userId: string; name: string }) {
  const { t } = useLingui();
  const id = useId();
  const choice = useProfileAvatarChoice(userId);
  const setAvatar = useProfileAvatarStore(state => state.setAvatar);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-label`}>
      <div className="flex flex-col gap-1">
        <Label id={`${id}-label`}>
          <Trans>Avatar</Trans>
        </Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          <Trans>Choose initials or a Marble avatar. Changes save automatically on this device.</Trans>
        </p>
      </div>
      <RadioGroup
        className="flex flex-wrap gap-3"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        value={choice}
        disabled={!userId}
        onValueChange={value => {
          if (isProfileAvatarChoice(value)) {
            setAvatar(userId, value);
          }
        }}
      >
        {PROFILE_AVATAR_CHOICES.map((value, index) => (
          <div key={value}>
            <RadioGroupItem id={`${id}-${value}`} value={value} className="peer sr-only" />
            <Label
              htmlFor={`${id}-${value}`}
              className="relative flex size-14 cursor-pointer items-center justify-center rounded-control border border-border hover:bg-accent peer-data-[state=checked]:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            >
              <ProfileAvatar name={name} choice={value} className="size-10" />
              <span className="sr-only">{value === "initials" ? t`Initials` : t`Marble avatar ${index}`}</span>
              {choice === value && (
                <Check
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 size-4 rounded-full bg-primary text-primary-foreground"
                />
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </section>
  );
}
