import {
  About,
  Calendar,
  General,
  Integrations,
  Lab,
  LocalAI,
  Notifications,
  Privacy,
  Profile,
  Sound,
  TemplatesView,
} from "@/components/settings/views";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@typr/ui/components/ui/breadcrumb";
import { Trans, useLingui } from "@lingui/react/macro";

export function SettingsDialogContent() {
  const { activeTab, pendingAction, consumePendingAction } = useSettingsDialog();
  const { t } = useLingui();

  const getTabLabel = (tab: string) => {
    const labels: Record<string, () => string> = {
      general: () => t`General`,
      profile: () => t`Profile`,
      privacy: () => t`Privacy`,
      calendar: () => t`Calendar`,
      ai: () => t`AI models`,
      notifications: () => t`Notifications`,
      sound: () => t`Sound`,
      templates: () => t`Templates`,
      integrations: () => t`Integrations`,
      feedback: () => t`Feedback`,
      lab: () => t`Lab`,
      about: () => t`About`,
    };
    return labels[tab] ? labels[tab]() : tab;
  };

  return (
    <main className="flex h-full flex-1 flex-col overflow-hidden min-h-0">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">
                  <Trans>Settings</Trans>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{getTabLabel(activeTab)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {activeTab === "general" && <General />}
          {activeTab === "profile" && <Profile />}
          {activeTab === "privacy" && <Privacy />}
          {activeTab === "calendar" && <Calendar />}
          {activeTab === "notifications" && <Notifications />}
          {activeTab === "sound" && <Sound />}
          {activeTab === "ai" && <LocalAI />}
          {activeTab === "templates" && (
            <TemplatesView
              pendingAction={pendingAction}
              onPendingActionConsumed={consumePendingAction}
            />
          )}
          {activeTab === "integrations" && <Integrations />}
          {activeTab === "lab" && <Lab />}
          {activeTab === "about" && <About />}
        </div>
      </div>
    </main>
  );
}
