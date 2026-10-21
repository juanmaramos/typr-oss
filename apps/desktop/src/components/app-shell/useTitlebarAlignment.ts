import { commands } from "@typr/plugin-windows";
import { useEffect, useRef } from "react";

/** The rendered shell is the vertical reference for native macOS controls. */
export function useTitlebarAlignment(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      return;
    }
    let previous = "";
    const align = () => {
      const bounds = element.getBoundingClientRect();
      const centerY = bounds.top + bounds.height / 2;
      const viewportHeight = window.innerHeight;
      if (bounds.height <= 0 || centerY <= 0 || centerY > viewportHeight) {
        return;
      }
      const reference = `${centerY}:${viewportHeight}`;
      if (reference === previous) {
        return;
      }
      previous = reference;
      void commands.windowAlignTitlebarControls(centerY, viewportHeight).catch(console.error);
    };
    const observer = new ResizeObserver(align);
    observer.observe(element);
    window.addEventListener("resize", align);
    window.visualViewport?.addEventListener("resize", align);
    align();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", align);
      window.visualViewport?.removeEventListener("resize", align);
    };
  }, [enabled]);
  return ref;
}
