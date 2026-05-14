import { cn } from "@typr/ui/lib/utils";
import { Trans } from "@lingui/react/macro";

export const RatingDisplay = (
  { label, rating, maxRating = 3, iconClassName }: {
    label: string;
    rating: number;
    maxRating?: number;
    iconClassName: string;
  },
) => (
  <div className="flex flex-col items-center px-1 sm:px-2">
    <span className="text-[8px] sm:text-[10px] text-muted-foreground uppercase font-medium tracking-wider mb-1 sm:mb-1.5">
      {label}
    </span>
    <div className="flex space-x-0.5 sm:space-x-1">
      {[...Array(maxRating)].map((_, i) => (
        <i
          key={i}
          className={cn(
            iconClassName,
            "text-xs sm:text-sm",
            i < rating ? "text-primary" : "text-muted-foreground/50",
          )}
        />
      ))}
    </div>
  </div>
);

export const LanguageDisplay = ({ support }: { support: "multilingual" | "english-only" }) => (
  <div className="flex flex-col items-center px-2">
    <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider mb-1.5">
      <Trans>Language</Trans>
    </span>
    <div className="flex items-center">
      <i
        className={cn(
          "ri-global-line text-sm",
          support === "multilingual" ? "text-primary" : "text-muted-foreground/50",
        )}
      />
      <span className="text-xs ml-1">
        {support === "multilingual" ? <Trans>All</Trans> : "EN"}
      </span>
    </div>
  </div>
);
