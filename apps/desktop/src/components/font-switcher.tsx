import { Trans } from "@lingui/react/macro";
import { radii } from "@typr/ui/lib/radii";
import { useEffect, useState } from "react";

import { typography } from "@typr/ui/lib/typography";

const FONT_OPTIONS = [
  {
    name: "Plus Jakarta Sans",
    family: "\"Plus Jakarta Sans\", system-ui, -apple-system, \"Helvetica Neue\", Arial, sans-serif",
  },
  { name: "Switzer", family: "\"Switzer\", system-ui, -apple-system, \"Helvetica Neue\", Arial, sans-serif" },
  { name: "Onest", family: "\"Onest\", system-ui, -apple-system, \"Helvetica Neue\", Arial, sans-serif" },
  { name: "Kumbh Sans", family: "\"Kumbh Sans\", system-ui, -apple-system, \"Helvetica Neue\", Arial, sans-serif" },
] as const;

const STYLE_ID = "font-switcher-weight-override";

export function FontSwitcher() {
  const [selected, setSelected] = useState(() => Math.min(0, FONT_OPTIONS.length - 1));
  const [collapsed, setCollapsed] = useState(false);
  const [lightWeights, setLightWeights] = useState(false);

  useEffect(() => {
    const idx = Math.min(selected, FONT_OPTIONS.length - 1);
    if (idx !== selected) {
      setSelected(idx);
    }
    document.documentElement.style.setProperty("--font-sans", FONT_OPTIONS[idx].family);
  }, [selected]);

  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (lightWeights) {
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = `
        .font-medium { font-weight: ${typography.fontWeight.medium} !important; }
        .font-semibold { font-weight: ${typography.fontWeight.semibold} !important; }
      `;
    } else if (style) {
      style.remove();
    }
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, [lightWeights]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="font-system text-ui-label"
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 99999,
          background: "#18181b",
          color: "#fafafa",
          border: "1px solid #3f3f46",
          borderRadius: radii.control,
          padding: "6px 12px",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        🔤 {FONT_OPTIONS[selected].name}
        {lightWeights ? " · 400" : ""}
      </button>
    );
  }

  return (
    <div
      className="font-system text-ui"
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        background: "#18181b",
        color: "#fafafa",
        border: "1px solid #3f3f46",
        borderRadius: radii.surface,
        padding: 16,
        width: 300,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className="font-bold text-ui-control">
          <Trans>Sans Font Switcher</Trans>
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-ui-heading"
          style={{
            background: "none",
            border: "none",
            color: "#a1a1aa",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <button
        onClick={() => setLightWeights((v) => !v)}
        className="text-ui-label"
        style={{
          width: "100%",
          padding: "6px 10px",
          marginBottom: 8,
          borderRadius: radii.control,
          border: lightWeights ? "1px solid #6366f1" : "1px solid #3f3f46",
          background: lightWeights ? "#1e1b4b" : "transparent",
          color: "#fafafa",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {lightWeights ? "✓ " : ""}
        <Trans>Lighter weights (medium→400, semibold→500)</Trans>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {FONT_OPTIONS.map((font, i) => (
          <button
            key={font.name}
            onClick={() => setSelected(i)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              padding: "8px 10px",
              borderRadius: radii.control,
              border: selected === i ? "1px solid #6366f1" : "1px solid transparent",
              background: selected === i ? "#1e1b4b" : "transparent",
              color: "#fafafa",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span className="text-ui-control font-semibold" style={{ fontFamily: font.family }}>
              {font.name}
              {i === 0 && (
                <span className="font-system text-ui-caption" style={{ color: "#6366f1", marginLeft: 6 }}>
                  <Trans>current</Trans>
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
