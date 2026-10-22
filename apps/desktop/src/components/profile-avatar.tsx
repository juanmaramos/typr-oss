import { profileAvatarSource, profileInitials } from "@/lib/profile-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@typr/ui/components/ui/avatar";
import { cn } from "@typr/ui/lib/utils";

export function ProfileAvatar({ name, choice, className }: {
  name: string | null | undefined;
  choice: unknown;
  className?: string;
}) {
  const src = profileAvatarSource(choice);
  return (
    <Avatar className={cn("bg-muted", className)} aria-hidden="true">
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-muted text-foreground font-medium">
        {profileInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
