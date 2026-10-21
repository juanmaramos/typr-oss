import { formatModelSize } from "@/lib/model-metadata";
import { transcriptionSetupSizeBytes } from "@/lib/stt-setup";
import { useLingui } from "@lingui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import { getSttModelSize, sttModelMetadata } from "@/components/transcript/constants/languageData";
import { type AISettingsSection, useSettingsDialog } from "@/contexts/settings-dialog";
import { usePlatform } from "@/hooks/usePlatform";
import { getAvailableSettingsSttModels, sttCapabilitiesQueryOptions } from "@/lib/stt-capabilities";
import { Trans } from "@lingui/react/macro";
import { commands as localLlmCommands, SupportedModel } from "@typr/plugin-local-llm";

import {
  commands as localSttCommands,
  type ModelCapabilities,
  type SupportedModel as SupportedSttModel,
} from "@typr/plugin-local-stt";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@typr/ui/components/ui/tabs";
import { showLlmModelDownloadToast, showSttModelDownloadToast } from "../../toast/shared";

import { LLMLocalView } from "../components/ai/llm-local-view";
import { SharedLLMProps, SharedSTTProps, STTModel } from "../components/ai/shared";
import { STTView } from "../components/ai/stt-view";
import { AiTaskDefaultsSettings } from "../components/ai/task-defaults";

const getInitialSttModels = (
  modelKeys: readonly SupportedSttModel[],
  capabilities?: readonly ModelCapabilities[],
): STTModel[] => [
  ...modelKeys.map((key) => {
    const metadata = sttModelMetadata[key];

    return {
      key,
      name: metadata.name,

      size: capabilities ? formatModelSize(transcriptionSetupSizeBytes(key, capabilities)) : getSttModelSize(key),
      downloaded: false,
      fileName: "",
    };
  }),
  {
    key: "AssemblyAIUniversal",
    name: sttModelMetadata.AssemblyAIUniversal.name,

    size: "0 MB",
    downloaded: true, // Cloud models are always "available"
    fileName: "",
    isCloud: true,
  },
];

export default function LocalAI() {
  const queryClient = useQueryClient();
  const { supportsLocalModels } = usePlatform();
  const { activeAiSection, setActiveAiSection } = useSettingsDialog();

  // Filter models for Windows
  useLingui();
  const capabilities = useQuery(sttCapabilitiesQueryOptions());
  const visibleSttModels = getInitialSttModels(getAvailableSettingsSttModels(capabilities.data), capabilities.data)
    .filter(m => supportsLocalModels || m.isCloud);

  // STT State
  const [isWerModalOpen, setIsWerModalOpen] = useState(false);
  const sttModels = visibleSttModels;

  // Shared Model Download Function
  const handleModelDownload = async (modelKey: string) => {
    const sttModel = sttModels.find(model => model.key === modelKey);

    if (!sttModel) {
      await handleLlmModelDownload(modelKey);
      return;
    }

    if (sttModel.isCloud) {
      return;
    }

    // Handle STT model download
    showSttModelDownloadToast(modelKey as SupportedSttModel, undefined, queryClient);
  };

  const handleLlmModelDownload = async (modelKey: string) => {
    showLlmModelDownloadToast(modelKey as SupportedModel, undefined, queryClient);
  };

  const handleShowFileLocation = async (modelType: "stt" | "llm") => {
    const path = await (modelType === "stt" ? localSttCommands.modelsDir() : localLlmCommands.modelsDir());
    await openPath(path);
  };

  // Prepare props for child components
  const sttProps: SharedSTTProps & { isWerModalOpen: boolean; setIsWerModalOpen: (open: boolean) => void } = {
    sttModels,
    handleModelDownload,
    handleShowFileLocation,
    isWerModalOpen,
    setIsWerModalOpen,
    supportsLocalModels,
  };

  const localLlmProps: SharedLLMProps = {
    handleModelDownload,
    handleShowFileLocation,
    supportsLocalModels,
  };

  return (
    <div className="space-y-5">
      <AiTaskDefaultsSettings />
      <Tabs
        value={activeAiSection}
        onValueChange={(value) => setActiveAiSection(value as AISettingsSection)}
        className="space-y-5"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="chat">
            <Trans>Chat</Trans>
          </TabsTrigger>
          <TabsTrigger value="transcription">
            <Trans>Transcription</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-0">
          <LLMLocalView {...localLlmProps} />
        </TabsContent>
        <TabsContent value="transcription" className="mt-0">
          <STTView {...sttProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
