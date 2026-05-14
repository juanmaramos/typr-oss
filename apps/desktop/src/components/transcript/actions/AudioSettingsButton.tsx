import { useSettingsDialog } from "@/contexts/settings-dialog";
import { ResponsiveIconButton } from "@typr/ui";
import { useLingui } from "@lingui/react/macro";
import { SettingsIcon } from "lucide-react";

interface AudioSettingsButtonProps {
  displayMode?: "icon" | "full";
  variant?: "ghost" | "outline";
  className?: string;
  size?: "sm" | "md";
}

export function AudioSettingsButton({
  displayMode = "full",
  variant = "ghost",
  className,
  size = "sm",
}: AudioSettingsButtonProps) {
  const { t } = useLingui();
  const { openDialog } = useSettingsDialog();

  const handleOpen = () => {
    openDialog("ai", null, "transcription");
  };

  return (
    <ResponsiveIconButton
      icon={SettingsIcon}
      text={t`Audio Settings`}
      onClick={handleOpen}
      displayMode={displayMode}
      variant={variant}
      className={`h-7 px-2 ${className || ""}`}
      size={size}
    />
  );
}
