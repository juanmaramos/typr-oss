import { motion } from "motion/react";
import React, { useEffect, useState } from "react";

import { useOngoingSession } from "@typr/utils/contexts";

type WaveformInput = "all" | "mic" | "speaker";
type WaveformSize = "compact" | "default" | "large";
export type GoogleMeetWaveformColor = "info" | "primary" | "success" | "warning" | "destructive" | "blue-dark";

const AUDIO_AMPLITUDE_NORMALIZATION = 5;
const SPEAKING_AMPLITUDE_THRESHOLD = 0.01;

const SIZE_CONFIG = {
  compact: {
    container: "w-6 h-4",
    circleSize: "3.5px",
    capsuleRadius: "1.75px",
    gap: "gap-0.5",
  },
  default: {
    container: "w-8 h-6",
    circleSize: "4.5px",
    capsuleRadius: "2.25px",
    gap: "gap-0.5",
  },
  large: {
    container: "w-10 h-8",
    circleSize: "6.5px",
    capsuleRadius: "3.25px",
    gap: "gap-1",
  },
} as const satisfies Record<WaveformSize, {
  container: string;
  circleSize: string;
  capsuleRadius: string;
  gap: string;
}>;

const COLOR_STYLES = {
  info: "hsl(var(--info))",
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  "blue-dark": "hsl(var(--blue-dark))",
} as const satisfies Record<GoogleMeetWaveformColor, string>;

interface GoogleMeetWaveformProps {
  /** Whether recording is active (controls visibility/context) */
  isRecording: boolean;
  /** Input source filter for audio detection */
  input?: WaveformInput;
  /** Size variant for different use cases */
  size?: WaveformSize;
  /** Color variant using design system colors */
  color?: GoogleMeetWaveformColor;
  /** Custom className for additional styling */
  className?: string;
}

export function normalizeGoogleMeetWaveformAmplitude(
  mic: number,
  speaker: number,
  input: WaveformInput = "all",
) {
  let sample = 0;

  if (input === "all") {
    sample = Math.max(mic, speaker) / AUDIO_AMPLITUDE_NORMALIZATION;
  } else if (input === "mic") {
    sample = mic / AUDIO_AMPLITUDE_NORMALIZATION;
  } else if (input === "speaker") {
    sample = speaker / AUDIO_AMPLITUDE_NORMALIZATION;
  }

  return Math.min(Math.max(sample, 0), 1);
}

/**
 * Google Meet Style Waveform Component
 *
 * Displays an animated 3-bar waveform similar to Google Meet's speaking indicator.
 * Only animates when actual audio is detected, not just when recording is active.
 * Based on the official Google Meet Lottie animation with CSS/Framer Motion implementation.
 *
 * @example
 * ```tsx
 * <GoogleMeetWaveform
 *   isRecording={isRecording}
 *   input="all"
 *   size="compact"
 *   color="blue-dark"
 * />
 * ```
 */
export function GoogleMeetWaveform({
  isRecording,
  input = "all",
  size = "default",
  color = "success",
  className = "",
}: GoogleMeetWaveformProps) {
  const { mic, speaker } = useOngoingSession((state) => state.amplitude);
  const [amplitude, setAmplitude] = useState(0);

  useEffect(() => {
    if (!isRecording) {
      setAmplitude(0);
      return;
    }

    setAmplitude(normalizeGoogleMeetWaveformAmplitude(mic, speaker, input));
  }, [mic, speaker, input, isRecording]);

  return (
    <GoogleMeetWaveformView
      amplitude={amplitude}
      size={size}
      color={color}
      className={className}
    />
  );
}

export function GoogleMeetWaveformView({
  amplitude,
  size = "default",
  color = "success",
  className = "",
}: {
  amplitude: number;
  size?: WaveformSize;
  color?: GoogleMeetWaveformColor;
  className?: string;
}) {
  const config = SIZE_CONFIG[size];
  const backgroundColor = COLOR_STYLES[color] || COLOR_STYLES.success;
  const hasAudio = amplitude > SPEAKING_AMPLITUDE_THRESHOLD;
  const barStyle: React.CSSProperties = {
    backgroundColor,
    willChange: hasAudio ? "height, border-radius" : "auto",
    transformOrigin: "center",
    width: config.circleSize,
    height: config.circleSize,
    overflow: "hidden",
    backfaceVisibility: "hidden",
  };

  // Animation variants - perfect circle to capsule using height animation
  const sideBarVariants = {
    muted: {
      height: config.circleSize, // Perfect square
      borderRadius: "50%", // True circle when height = width
      transition: {
        height: {
          duration: 0.4,
          ease: [0.25, 0.1, 0.25, 1.0],
        },
        borderRadius: {
          duration: 0.15, // Faster transition to circle shape
          ease: [0.25, 0.1, 0.25, 1.0],
        },
      },
    },
    speaking: {
      height: [
        config.circleSize,
        `${parseFloat(config.circleSize) * 2.0}px`,
        `${parseFloat(config.circleSize) * 1.6}px`,
        `${parseFloat(config.circleSize) * 2.3}px`,
        `${parseFloat(config.circleSize) * 1.4}px`,
        `${parseFloat(config.circleSize) * 2.1}px`,
        `${parseFloat(config.circleSize) * 1.2}px`,
        `${parseFloat(config.circleSize) * 1.8}px`,
        `${parseFloat(config.circleSize) * 1.1}px`,
      ],
      borderRadius: config.capsuleRadius, // Perfect capsule - half the width
      transition: {
        height: {
          duration: 1.6,
          repeat: Infinity,
          ease: [0.4, 0.0, 0.6, 1.0],
          delay: 0,
        },
        borderRadius: {
          duration: 0.1, // Very fast transition to capsule
          ease: [0.25, 0.1, 0.25, 1.0],
        },
      },
    },
  };

  const centerBarVariants = {
    muted: {
      height: config.circleSize, // Perfect square
      borderRadius: "50%", // True circle when height = width
      transition: {
        height: {
          duration: 0.5, // Slightly longer for center prominence
          ease: [0.25, 0.1, 0.25, 1.0],
          delay: 0.1, // Slight delay for cascading effect
        },
        borderRadius: {
          duration: 0.15, // Faster transition to circle shape
          ease: [0.25, 0.1, 0.25, 1.0],
          delay: 0.1, // Same delay as height
        },
      },
    },
    speaking: {
      height: [
        config.circleSize,
        `${parseFloat(config.circleSize) * 3.5}px`,
        `${parseFloat(config.circleSize) * 2.8}px`,
        `${parseFloat(config.circleSize) * 4.0}px`,
        `${parseFloat(config.circleSize) * 2.5}px`,
        `${parseFloat(config.circleSize) * 3.7}px`,
        `${parseFloat(config.circleSize) * 2.2}px`,
        `${parseFloat(config.circleSize) * 3.2}px`,
        `${parseFloat(config.circleSize) * 1.8}px`,
      ],
      borderRadius: config.capsuleRadius, // Perfect capsule - half the width
      transition: {
        height: {
          duration: 1.8,
          repeat: Infinity,
          ease: [0.4, 0.0, 0.6, 1.0],
          delay: 0.2, // Slight independence from sides
        },
        borderRadius: {
          duration: 0.1, // Very fast transition to capsule
          ease: [0.25, 0.1, 0.25, 1.0],
        },
      },
    },
  };

  // Determine animation state
  const animationState = hasAudio ? "speaking" : "muted";

  return (
    <div className={`flex items-center justify-center ${config.container} ${config.gap} ${className}`}>
      {/* Left Bar/Dot */}
      <motion.div
        variants={sideBarVariants}
        animate={animationState}
        style={barStyle}
      />

      {/* Center Bar/Dot */}
      <motion.div
        variants={centerBarVariants}
        animate={animationState}
        style={barStyle}
      />

      {/* Right Bar/Dot */}
      <motion.div
        variants={sideBarVariants}
        animate={animationState}
        style={barStyle}
      />
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export default React.memo(GoogleMeetWaveform);
