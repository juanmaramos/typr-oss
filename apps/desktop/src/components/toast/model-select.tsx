import { commands as connectorCommands } from "@typr/plugin-connector";
import { commands as localSttCommands, SupportedModel } from "@typr/plugin-local-stt";
import { Button } from "@typr/ui/components/ui/button";
import { sonnerToast, toast } from "@typr/ui/components/ui/toast";
import { Trans } from "@lingui/react/macro";

export async function showModelSelectToast(language: string, openSettingsDialog: () => void) {
  const connectorModel = await connectorCommands.getSttModel().catch(() => "");
  const isCloudModel = connectorModel.includes("assemblyai");
  if (isCloudModel) {
    return;
  }

  const currentModel = await localSttCommands.getCurrentModel();
  const englishModels: SupportedModel[] = ["QuantizedTinyEn", "QuantizedBaseEn", "QuantizedSmallEn"];

  if (language === "en" || !englishModels.includes(currentModel)) {
    return;
  }

  const handleClick = () => {
    openSettingsDialog();
    sonnerToast.dismiss(id);
  };

  const id = "language-model-mismatch";

  toast({
    id,
    title: <Trans>Speech-to-Text Model Mismatch</Trans>,
    content: (
      <div className="space-y-2">
        <div>
          <Trans>English-only model cannot be used with non-English languages.</Trans>
        </div>
        <Button
          variant="default"
          onClick={handleClick}
        >
          <Trans>Open AI models</Trans>
        </Button>
      </div>
    ),
    dismissible: true,
  });
}
