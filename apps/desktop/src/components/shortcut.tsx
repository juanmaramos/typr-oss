import { Kbd, KbdKey } from "@typr/ui/components/ui/kbd";
import { useQuery } from "@tanstack/react-query";
import { type as getOsType } from "@tauri-apps/plugin-os";

import { parseShortcut } from "@/utils/keyboard-shortcuts";

export default function Shortcut({
  macDisplay,
  windowsDisplay,
  variant = "default",
}: {
  macDisplay: string;
  windowsDisplay: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const osType = useQuery({
    queryKey: ["osType"],
    queryFn: () => getOsType(),
    staleTime: Infinity,
  });

  const display = osType.data === "macos" ? macDisplay : windowsDisplay;
  const keys = parseShortcut(display);

  return (
    <Kbd variant={variant}>
      {keys.map((key, index) => <KbdKey key={index}>{key}</KbdKey>)}
    </Kbd>
  );
}
