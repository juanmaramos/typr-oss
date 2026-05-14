import { motion, Variants } from "motion/react";
import { useEffect, useState } from "react";

import { useOngoingSession } from "@typr/utils/contexts";

interface AudioPulseProps {
  /** Input source filter */
  input?: "all" | "mic" | "speaker";
  /** Size variant */
  size?: "default" | "compact";
}

export default function AudioPulse({
  input = "all",
  size = "default",
}: AudioPulseProps) {
  const { mic, speaker } = useOngoingSession((state) => state.amplitude);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    let sample = 0;

    if (input === "all") {
      sample = Math.max(mic, speaker) / 5;
    } else if (input === "mic") {
      sample = mic / 5;
    } else if (input === "speaker") {
      sample = speaker / 5;
    }

    // Use same responsiveness as working green implementation
    setAmplitude(Math.min(sample, 1));
  }, [mic, speaker, input]);

  // Check if we have sound or silence
  const isFlat = amplitude === 0;

  // Container size
  const containerSize = size === "compact" ? "w-6 h-6" : "w-7 h-7";

  // Dot size for resting state (when no sound)
  const dotSize = size === "compact" ? 3 : 4;

  // Base heights for bars when sound is detected
  const baseCenterHeight = size === "compact" ? 10 : 12;
  const baseSideHeight = size === "compact" ? 6 : 8;

  // Calculate responsive heights - dots when flat, bars when sound
  const centerHeight = isFlat ? dotSize : baseCenterHeight * Math.max(0.3, amplitude);
  const sideHeight = isFlat ? dotSize : baseSideHeight * Math.max(0.3, amplitude);

  // Width - dots are round (width = height), bars are thin
  const centerWidth = isFlat ? dotSize : 2;
  const sideWidth = isFlat ? dotSize : 2;

  // Elegant variants with sophisticated transitions
  const centerVariants: Variants = {
    pulse: {
      scaleY: isFlat ? 1 : [1, 1.6, 1], // No pulsing when dots
      transition: isFlat
        ? {
          duration: 0.8,
          ease: [0.25, 0.46, 0.45, 0.94], // Custom cubic-bezier for elegance
        }
        : {
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
        },
    },
    resting: {
      scaleY: 1,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94], // Elegant easing
      },
    },
  };

  const sideVariants: Variants = {
    pulse: {
      scaleY: isFlat ? 1 : [1, 1.4, 1], // No pulsing when dots
      transition: isFlat
        ? {
          duration: 0.8,
          ease: [0.25, 0.46, 0.45, 0.94],
          delay: 0.1, // Slight stagger even in morphing
        }
        : {
          duration: 1.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        },
    },
    resting: {
      scaleY: 1,
      transition: {
        duration: 0.8,
        ease: [0.25, 0.46, 0.45, 0.94],
        delay: 0.1, // Stagger the side elements
      },
    },
  };

  return (
    <div
      className={`${containerSize} rounded-full flex items-center justify-center gap-0.5 bg-background shadow-md`}
      style={{
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)",
      }}
    >
      <div className="flex items-end justify-center gap-0.5">
        {/* Left side element - dot when silent, bar when sound */}
        <motion.div
          animate={amplitude > 0 ? "pulse" : "resting"}
          variants={sideVariants}
          className="rounded-full"
          style={{
            width: `${sideWidth}px`,
            height: `${sideHeight}px`,
            backgroundColor: "hsl(var(--info))",
            willChange: "transform",
          }}
        />

        {/* Center element - dot when silent, bar when sound */}
        <motion.div
          animate={amplitude > 0 ? "pulse" : "resting"}
          variants={centerVariants}
          className="rounded-full"
          style={{
            width: `${centerWidth}px`,
            height: `${centerHeight}px`,
            backgroundColor: "hsl(var(--info))",
            willChange: "transform",
          }}
        />

        {/* Right side element - dot when silent, bar when sound */}
        <motion.div
          animate={amplitude > 0 ? "pulse" : "resting"}
          variants={sideVariants}
          className="rounded-full"
          style={{
            width: `${sideWidth}px`,
            height: `${sideHeight}px`,
            backgroundColor: "hsl(var(--info))",
            willChange: "transform",
          }}
        />
      </div>
    </div>
  );
}
