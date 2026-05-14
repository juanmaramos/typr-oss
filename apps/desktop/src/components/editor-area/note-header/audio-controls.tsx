import { RiPauseFill, RiPlayFill } from "@remixicon/react";
import { useState } from "react";

export const AudioControls = () => {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="fixed right-5 top-5 z-10 text-background">
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className="rounded-full bg-foreground p-2 transition-colors duration-200 hover:bg-foreground/70"
      >
        {isPlaying ? <RiPauseFill size={24} /> : <RiPlayFill size={24} />}
      </button>
    </div>
  );
};
