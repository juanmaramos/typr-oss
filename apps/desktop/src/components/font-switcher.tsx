import { useEffect, useState } from "react";

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
        .font-medium { font-weight: 400 !important; }
        .font-semibold { font-weight: 500 !important; }
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
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 99999,
          background: "#18181b",
          color: "#fafafa",
          border: "1px solid #3f3f46",
          borderRadius: 8,
          padding: "6px 12px",
          fontSize: 12,
          fontFamily: "system-ui",
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
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 99999,
        background: "#18181b",
        color: "#fafafa",
        border: "1px solid #3f3f46",
        borderRadius: 12,
        padding: 16,
        width: 300,
        fontFamily: "system-ui",
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Sans Font Switcher</span>
        <button
          onClick={() => setCollapsed(true)}
          style={{
            background: "none",
            border: "none",
            color: "#a1a1aa",
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>

      <button
        onClick={() => setLightWeights((v) => !v)}
        style={{
          width: "100%",
          padding: "6px 10px",
          marginBottom: 8,
          borderRadius: 6,
          border: lightWeights ? "1px solid #6366f1" : "1px solid #3f3f46",
          background: lightWeights ? "#1e1b4b" : "transparent",
          color: "#fafafa",
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
        }}
      >
        {lightWeights ? "✓ " : ""}Lighter weights (medium→400, semibold→500)
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
              borderRadius: 8,
              border: selected === i ? "1px solid #6366f1" : "1px solid transparent",
              background: selected === i ? "#1e1b4b" : "transparent",
              color: "#fafafa",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <span style={{ fontFamily: font.family, fontSize: 14, fontWeight: 500 }}>
              {font.name}
              {i === 0 && (
                <span style={{ color: "#6366f1", fontSize: 11, marginLeft: 6, fontFamily: "system-ui" }}>
                  current
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
