import { Button } from "@typr/ui/components/ui/button";
import { RiFlashlightFill, RiPlayFill } from "@remixicon/react";
import { mergeAttributes, Node, NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useState } from "react";

// OSS builds must not depend on Typr-hosted CDN assets.
const ONBOARDING_VIDEO_URL = "";

const Hypercharge = ({ HTMLAttributes }: NodeViewProps) => {
  const text = HTMLAttributes.text;

  return (
    <NodeViewWrapper>
      <div className="flex flex-row items-center gap-3 rounded-xl bg-primary/10 px-2 py-0.5 shadow-md shadow-border/50">
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/30 shadow-primary/30 animate-pulse shadow-lg ring-2 ring-primary/20 ring-offset-0 ring-offset-background">
          <RiFlashlightFill className="text-primary/50" />
        </div>
        <p className="text-sm text-foreground">{text}</p>
      </div>
    </NodeViewWrapper>
  );
};

export const TyprchargeNode = Node.create({
  name: "typrcharge",
  group: "block",
  addAttributes() {
    return {
      text: {
        default: "warning: use 'text' attribute to set the text.",
      },
    };
  },
  parseHTML() {
    return [{ tag: "typrcharge" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["typrcharge", mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(Hypercharge);
  },
});

const OnboardingVideo = ({ HTMLAttributes }: NodeViewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const hasVideo = ONBOARDING_VIDEO_URL.length > 0;

  return (
    <NodeViewWrapper {...HTMLAttributes}>
      <div className="onboarding-video rounded-xl bg-accent hover:bg-accent/80 transition-colors p-4 my-4 w-full shadow-sm hover:shadow-md">
        {/* 3-column layout: thumbnail - text - button */}
        <div className="flex items-center justify-between gap-4">
          {/* Column 1: Thumbnail */}
          <div className="flex-shrink-0">
            <div
              className={[
                "relative w-16 h-12 rounded-lg overflow-hidden bg-muted",
                hasVideo ? "cursor-pointer" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => {
                if (hasVideo) {
                  setIsPlaying(true);
                }
              }}
            >
              <img
                src="/assets/video-thumbnail.png"
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              {hasVideo && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Text content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground mb-1">
              See Typr in action
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasVideo ? "Watch live transcription demo (30 secs)" : "Demo video is not bundled in OSS builds"}
            </p>
          </div>

          {/* Column 3: Play button */}
          {hasVideo && (
            <div className="flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPlaying(true)}
                className="gap-2"
              >
                <RiPlayFill className="w-4 h-4" />
                <span>Play Demo</span>
              </Button>
            </div>
          )}
        </div>

        {/* Video player (expanded state) */}
        {isPlaying && hasVideo && (
          <div className="mt-4 pt-4">
            <video
              controls
              autoPlay
              className="w-full rounded-lg"
              style={{ aspectRatio: "16 / 9" }}
              onPlay={() => setIsPlaying(true)}
            >
              <source src={ONBOARDING_VIDEO_URL} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const OnboardingVideoNode = Node.create({
  name: "onboardingvideo",
  group: "block",
  addAttributes() {
    return {};
  },
  parseHTML() {
    return [{ tag: "onboarding-video" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["onboarding-video", mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(OnboardingVideo);
  },
});
