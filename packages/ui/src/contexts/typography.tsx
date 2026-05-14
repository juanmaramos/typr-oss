import { createContext, useContext, useEffect, useState } from "react";

export type TypographyStyle = "modern" | "editorial" | "classic";

type TypographyProviderProps = {
  children: React.ReactNode;
  defaultStyle?: TypographyStyle;
  storageKey?: string;
};

type TypographyProviderState = {
  style: TypographyStyle;
  setStyle: (style: TypographyStyle) => void;
};

const initialState: TypographyProviderState = {
  style: "editorial",
  setStyle: () => null,
};

const TypographyProviderContext = createContext<TypographyProviderState>(initialState);

const styleMap: Record<TypographyStyle, { heading: string; body: string }> = {
  modern: {
    heading: "var(--font-sans)",
    body: "var(--font-sans)",
  },
  editorial: {
    heading: "var(--font-serif)",
    body: "var(--font-sans)",
  },
  classic: {
    heading: "var(--font-sans)",
    body: "var(--font-serif)",
  },
};

export function TypographyProvider({
  children,
  defaultStyle = "editorial",
  storageKey = "typr-typography-style",
  ...props
}: TypographyProviderProps) {
  const [style, setStyleState] = useState<TypographyStyle>(
    () => (localStorage.getItem(storageKey) as TypographyStyle) || defaultStyle,
  );

  useEffect(() => {
    const root = window.document.documentElement;
    const { heading, body } = styleMap[style];
    root.style.setProperty("--font-heading", heading);
    root.style.setProperty("--font-body", body);
  }, [style]);

  const value = {
    style,
    setStyle: (style: TypographyStyle) => {
      localStorage.setItem(storageKey, style);
      setStyleState(style);
    },
  };

  return (
    <TypographyProviderContext.Provider {...props} value={value}>
      {children}
    </TypographyProviderContext.Provider>
  );
}

export const useTypographyStyle = () => {
  const context = useContext(TypographyProviderContext);

  if (!context) {
    throw new Error("useTypographyStyle must be used within a TypographyProvider");
  }

  return context;
};
