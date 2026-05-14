import { TabIcon } from "@/components/settings/components/tab-icon";
import { TABS } from "@/components/settings/components/types";
import { useSettingsDialog } from "@/contexts/settings-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@typr/ui/components/ui/sidebar";
import { Trans, useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";

export function SettingsDialogSidebar() {
  const { activeTab, setActiveTab } = useSettingsDialog();
  const { t } = useLingui();

  const handleFeedbackClick = () => {
    openUrl("https://github.com/juanmaramos/typr-oss/issues");
  };

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

  const settingsSections = {
    general: ["general", "profile"],
    privacy: ["privacy"],
    features: ["calendar", "ai", "notifications", "sound", "templates", "integrations", "lab"],
    account: ["feedback", "about"],
  };

  return (
    <Sidebar collapsible="none" className="hidden md:flex border-r bg-sidebar w-60">
      <SidebarContent>
        <div className="flex h-16 shrink-0 items-center px-4 border-b">
          <h2 className="text-sm font-semibold text-foreground">
            <Trans>Settings</Trans>
          </h2>
        </div>

        {/* General Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[11px] text-muted-foreground uppercase tracking-wider">
            <Trans>General</Trans>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.filter(t => settingsSections.general.includes(t.name)).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={item.name === activeTab}
                    onClick={() =>
                      setActiveTab(item.name)}
                    className="gap-2"
                  >
                    <TabIcon tab={item.name} />
                    <span>{getTabLabel(item.name)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Privacy Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[11px] text-muted-foreground uppercase tracking-wider">
            <Trans>Privacy</Trans>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.filter(t => settingsSections.privacy.includes(t.name)).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={item.name === activeTab}
                    onClick={() =>
                      setActiveTab(item.name)}
                    className="gap-2"
                  >
                    <TabIcon tab={item.name} />
                    <span>{getTabLabel(item.name)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Features Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[11px] text-muted-foreground uppercase tracking-wider">
            <Trans>Features</Trans>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.filter(t => settingsSections.features.includes(t.name)).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={item.name === activeTab}
                    onClick={() =>
                      setActiveTab(item.name)}
                    className="gap-2"
                  >
                    <TabIcon tab={item.name} />
                    <span>{getTabLabel(item.name)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Account Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 text-[11px] text-muted-foreground uppercase tracking-wider">
            <Trans>Account</Trans>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.filter(t => settingsSections.account.includes(t.name)).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    isActive={item.name === activeTab}
                    onClick={() => {
                      if (item.name === "feedback") {
                        handleFeedbackClick();
                      } else {
                        setActiveTab(item.name);
                      }
                    }}
                    className="gap-2"
                  >
                    <TabIcon tab={item.name} />
                    <span>{getTabLabel(item.name)}</span>
                    {item.name === "feedback" && <i className="ri-external-link-line text-xs ml-auto" />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
