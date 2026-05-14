/**
 * @typr/fonts - Font package for Typr applications
 *
 * This package provides font definitions and assets for Typr applications.
 * Import the CSS files directly in your application:
 *
 * ```
 * import '@typr/fonts/css';
 * ```
 *
 */

// Export font family names as constants for type safety
export const FONT_FAMILIES = {
  SWITZER: "Switzer",
  CRIMSON_PRO: "Crimson Pro",
  JETBRAINS_MONO: "JetBrains Mono",
} as const;

// Export CSS variable names
export const CSS_VARIABLES = {
  FONT_SANS: "--font-sans",
  FONT_SERIF: "--font-serif",
  FONT_MONO: "--font-mono",
} as const;

// Export utility function to get CSS variable value
export function getFontFamily(variable: typeof CSS_VARIABLES[keyof typeof CSS_VARIABLES]): string {
  if (typeof window === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

// Export utility to check if fonts are loaded
export function areFontsLoaded(): Promise<boolean> {
  if (typeof document === "undefined") {
    return Promise.resolve(false);
  }

  return document.fonts.ready.then(() => {
    const switzerLoaded = document.fonts.check("1em \"Switzer\"");
    const crimsonLoaded = document.fonts.check("1em \"Crimson Pro\"");
    const jetbrainsLoaded = document.fonts.check("1em \"JetBrains Mono\"");
    return switzerLoaded && crimsonLoaded && jetbrainsLoaded;
  });
}
