/** Shared UI typography. Compact sizes intentionally preserve inherited line-height. */
export const typography = {
  fontSize: {
    "ui-micro": "8px",
    "ui-fine": "9px",
    "ui-tiny": "10px",
    "ui-caption": "11px",
    "ui-label": "12px",
    ui: "13px",
    "ui-control": "14px",
    "ui-body": "15px",
    "ui-heading": "16px",
    "ui-title": "17px",
    "ui-section": "24px",
    "ui-page": "32px",
  },
  lineHeight: {
    "ui-composer": "22px",
  },
  letterSpacing: {
    "ui-eyebrow": "0.14em",
  },
  fontFamily: {
    sans: ["var(--font-sans)"],
    serif: ["var(--font-serif)"],
    mono: ["var(--font-mono)"],
    heading: ["var(--font-heading)"],
    body: ["var(--font-body)"],
    system: ["system-ui"],
  },
  fontWeight: {
    normal: "400",
    medium: "400",
    semibold: "500",
    bold: "600",
  },
};
