import { cn } from "@typr/ui/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"i">) {
  return (
    <i
      role="status"
      aria-label="Loading"
      className={cn("ri-loader-4-line size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
