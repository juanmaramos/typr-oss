import { X } from "lucide-react";

import { Avatar, AvatarImage } from "@typr/ui/components/ui/avatar";
import { Button } from "@typr/ui/components/ui/button";

export interface InvitedUserProps {
  name: string;
  email: string;
  avatarUrl: string;
  onRemove: () => void;
}

export const InvitedUser = ({
  name,
  email,
  avatarUrl,
  onRemove,
}: InvitedUserProps) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Avatar className="h-8 w-8 bg-muted">
        <AvatarImage src={avatarUrl} alt={`${name}'s avatar`} />
      </Avatar>
      <div>
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{email}</div>
      </div>
    </div>
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-surface-400"
      onClick={onRemove}
    >
      <X className="size-4 text-muted-foreground" />
    </Button>
  </div>
);
