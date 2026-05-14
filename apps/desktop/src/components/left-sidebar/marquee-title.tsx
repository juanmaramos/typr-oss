import { useLayoutEffect, useRef, useState } from "react";

import { motion } from "motion/react";

import { cn } from "@typr/ui/lib/utils";

export function MarqueeTitle({
  text,
  className,
  hovered: externalHovered,
}: {
  text: string;
  className?: string;
  hovered?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [internalHovered, setInternalHovered] = useState(false);
  const hovered = externalHovered ?? internalHovered;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = textRef.current;
    if (!container || !el) {
      return;
    }

    const measure = () => {
      setOverflow(Math.max(0, el.scrollWidth - container.clientWidth));
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  const isMarquee = overflow > 0;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => setInternalHovered(true)}
      onMouseLeave={() => setInternalHovered(false)}
    >
      <motion.div
        ref={textRef}
        className="whitespace-nowrap"
        animate={{ x: hovered && isMarquee ? -overflow : 0 }}
        transition={hovered && isMarquee
          ? { duration: overflow / 40, ease: "linear", delay: 0.4 }
          : { duration: 0.3, ease: "easeOut" }}
      >
        {text}
      </motion.div>

      {isMarquee && (
        <motion.div
          className="absolute inset-y-0 right-0 w-4 pointer-events-none bg-gradient-to-l from-sidebar to-transparent"
          animate={{ opacity: hovered ? 0 : 1 }}
          transition={{ duration: 0.25 }}
        />
      )}
    </div>
  );
}
