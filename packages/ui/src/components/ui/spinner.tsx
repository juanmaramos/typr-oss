import { useLingui } from "@lingui/react/macro";
import { cn } from "@typr/ui/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"i">) {
  const { t } = useLingui();

  return (
    <i
      role="status"
      aria-label={t`Loading`}
      className={cn("ri-loader-4-line size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
