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
        ? (
          <>
            <img src="/icons/assemblyai-light.svg" alt="" className="size-4 object-contain dark:hidden" />
            <img src="/icons/assemblyai-dark.svg" alt="" className="hidden size-4 object-contain dark:block" />
          </>
        )
        : <i className={provider === "OpenAI" ? "ri-openai-fill" : "ri-voiceprint-line"} />}
    </span>
  );
}
