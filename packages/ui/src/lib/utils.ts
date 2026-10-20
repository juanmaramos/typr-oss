import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { typography } from "./typography";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Object.keys(typography.fontSize) }],
      "font-family": [{ font: Object.keys(typography.fontFamily) }],
      leading: [{ leading: Object.keys(typography.lineHeight) }],
      tracking: [{ tracking: Object.keys(typography.letterSpacing) }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
