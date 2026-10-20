import { useLayoutEffect, useState } from "react";

/** Adapt actions to the actual floating panel, including detached note windows. */
export function useFloatingToolbar() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { toolbarRef: setElement, isCompact: width > 0 && width < 520 };
}
