import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { useMemo, useState } from "react";

import { SETTINGS_LOCAL_STT_MODEL_KEYS, sttModelMetadata } from "@/components/transcript/constants/languageData";
import { type AISettingsSection, useSettingsDialog } from "@/contexts/settings-dialog";
import { usePlatform } from "@/hooks/usePlatform";
import { Trans } from "@lingui/react/macro";
import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localLlmCommands, SupportedModel } from "@typr/plugin-local-llm";

import { commands as localSttCommands, type SupportedModel as SupportedSttModel } from "@typr/plugin-local-stt";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@typr/ui/components/ui/tabs";
import { showLlmModelDownloadToast, showSttModelDownloadToast } from "../../toast/shared";

import { LLMLocalView } from "../components/ai/llm-local-view";
import { SharedLLMProps, SharedSTTProps, STTModel } from "../components/ai/shared";
import { STTView } from "../components/ai/stt-view";
import { AiTaskDefaultsSettings } from "../components/ai/task-defaults";

const initialSttModels: STTModel[] = [
  ...SETTINGS_LOCAL_STT_MODEL_KEYS.map((key) => {
    const metadata = sttModelMetadata[key];

    return {
      key,
      name: metadata.name,
      accuracy: metadata.intelligence,
      speed: metadata.speed,
      size: metadata.size,
      downloaded: false,
      fileName: "",
    };
  }),
  {
    key: "AssemblyAIUniversal",
    name: "Real-time multilingual",
    accuracy: 3,
    speed: 3,
    size: "0 MB",
    downloaded: true, // Cloud models are always "available"
    fileName: "",
    isCloud: true,
    supportedLanguages: "6 languages (EN, ES, FR, DE, IT, PT)", // AssemblyAI U3 Pro code-switching
  },
];

export default function LocalAI() {
  const queryClient = useQueryClient();
  const { supportsLocalModels } = usePlatform();
  const { activeAiSection, setActiveAiSection } = useSettingsDialog();

  // Filter models for Windows
  const visibleSttModels = useMemo(() => initialSttModels.filter(m => supportsLocalModels || m.isCloud), [
    supportsLocalModels,
  ]);

  // STT State
  const [isWerModalOpen, setIsWerModalOpen] = useState(false);
  const [selectedSTTModel, setSelectedSTTModel] = useState("QuantizedLargeTurbo"); // Default to multilingual
  const [sttModels, setSttModels] = useState(visibleSttModels);

  // LLM State
  const [selectedLLMModel, setSelectedLLMModel] = useState("Gemma4E4b");
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());

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
    setDownloadingModels(prev => new Set([...prev, modelKey]));

    showSttModelDownloadToast(modelKey as SupportedSttModel, () => {
      setSttModels(prev =>
        prev.map(model =>
          model.key === modelKey
            ? { ...model, downloaded: true }
            : model
        )
      );
      setDownloadingModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(modelKey);
        return newSet;
      });

      setSelectedSTTModel(modelKey);
      localSttCommands.setCurrentModel(modelKey as SupportedSttModel);
    }, queryClient);
  };

  // Queries needed by LLM download flow
  const customLLMEnabled = useQuery({
    queryKey: ["custom-llm-enabled"],
    queryFn: () => connectorCommands.getCustomLlmEnabled(),
  });

  const setCustomLLMEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => connectorCommands.setCustomLlmEnabled(enabled),
    onSuccess: () => {
      customLLMEnabled.refetch();
    },
  });

  const handleLlmModelDownload = async (modelKey: string) => {
    setDownloadingModels((prev) => new Set([...prev, modelKey]));

    showLlmModelDownloadToast(modelKey as SupportedModel, () => {
      setDownloadingModels((prev) => {
        const s = new Set(prev);
        s.delete(modelKey);
        return s;
      });

      setSelectedLLMModel(modelKey);
      localLlmCommands.setCurrentModel(modelKey as SupportedModel);
      setCustomLLMEnabledMutation.mutate(false);
    }, queryClient);
  };

  const handleShowFileLocation = async (modelType: "stt" | "llm") => {
    const path = await (modelType === "stt" ? localSttCommands.modelsDir() : localLlmCommands.modelsDir());
    await openPath(path);
  };

  // Prepare props for child components
  const sttProps: SharedSTTProps & { isWerModalOpen: boolean; setIsWerModalOpen: (open: boolean) => void } = {
    selectedSTTModel,
    setSelectedSTTModel,
    sttModels,
    setSttModels,
    downloadingModels,
    handleModelDownload,
    handleShowFileLocation,
    isWerModalOpen,
    setIsWerModalOpen,
    supportsLocalModels,
  };

  const localLlmProps: SharedLLMProps = {
    customLLMEnabled,
    selectedLLMModel,
    setSelectedLLMModel,
    setCustomLLMEnabledMutation,
    downloadingModels,
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
          <TabsTrigger value="transcription">
            <Trans>Transcription</Trans>
          </TabsTrigger>
          <TabsTrigger value="chat">
            <Trans>Chat</Trans>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transcription" className="mt-0">
          <STTView {...sttProps} />
        </TabsContent>
        <TabsContent value="chat" className="mt-0">
          <LLMLocalView {...localLlmProps} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
