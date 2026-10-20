import { NvidiaIcon } from "@/components/ui/nvidia-icon";
import { getSttModelMetadata } from "./constants/languageData";

/** Provider marks identify the model maker; execution location has its own badge. */
export function STTProviderIcon({ model, className = "" }: { model: string; className?: string }) {
  const provider = getSttModelMetadata(model)?.provider;
  const classes = `size-4 shrink-0 text-ui-heading leading-none ${className}`;
  return (
    <span
      aria-hidden="true"
      data-stt-provider={provider}
      className={`inline-flex items-center justify-center ${classes}`}
    >
      {provider === "NVIDIA"
        ? <NvidiaIcon className="size-4" />
        : provider === "AssemblyAI"
        ? <img src="/icons/assemblyai-mono.svg" alt="" className="size-4 object-contain dark:invert" />
        : provider === "Distil-Whisper"
        ? <img src="/icons/huggingface-mono.svg" alt="" className="size-4 object-contain dark:invert" />
        : <i className={provider === "OpenAI" ? "ri-openai-fill" : "ri-voiceprint-line"} />}
    </span>
  );
}
