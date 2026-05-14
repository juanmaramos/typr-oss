import { useLingui } from "@lingui/react/macro";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Loader } from "@/components/ui/loader";
import { useTypr } from "@/contexts";
import { safeAnalyticsEvent } from "@/utils/analytics-safe";
import { openSettingsWindow } from "@/utils/open-settings-window";
import { getTemplateDisplayName } from "@/utils/template-presentation";
import { Session, Template } from "@typr/plugin-db";
import { Popover, PopoverContent, PopoverTrigger } from "@typr/ui/components/ui/popover";
import { cn } from "@typr/ui/lib/utils";
import { useSession } from "@typr/utils/contexts";
import { Icon } from "../ui/icon";
import { TemplateIcon } from "../ui/template-icon";

interface FloatingButtonProps {
  session: Session;
  handleEnhance: () => void;
  handleEnhanceWithTemplate: (templateId: string) => void;
  handleCancel: () => void;
  templates: Template[];
  currentTemplateId?: string | null;
  isError: boolean;
  isEnhancing: boolean;
  progress?: number;
  showProgress?: boolean;
}

export function FloatingButton({
  session,
  handleEnhance,
  handleEnhanceWithTemplate,
  handleCancel,
  templates,
  currentTemplateId,
  isError,
  isEnhancing,
  progress = 0,
  showProgress,
}: FloatingButtonProps) {
  const { t } = useLingui();
  const { userId } = useTypr();
  const [showRaw, setShowRaw] = useSession(session.id, (s) => [
    s.showRaw,
    s.setShowRaw,
  ]);
  const [isHovered, setIsHovered] = useState(false);
  const [showRefreshIcon, setShowRefreshIcon] = useState(true);
  const [showTemplatePopover, setShowTemplatePopover] = useState(false);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();

  // Get translated template title for built-in templates
  const getTemplateTitle = (template: Template) => {
    if (!template.id.startsWith("default-")) {
      return template.title || t`Untitled Template`;
    }

    switch (template.id) {
      case "default-meeting-notes":
        return t`Meeting Notes`;
      case "default-one-on-one":
        return t`1-on-1 Meeting`;
      case "default-customer-call":
        return t`Customer Call`;
      case "default-job-interview":
        return t`Interview Debrief`;
      case "default-project-planning":
        return t`Project Kickoff`;
      default:
        return template.title || t`Untitled Template`;
    }
  };

  // Clean single source of truth - no more state duplication

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isHovered) {
      setShowRefreshIcon(true);
    }
  }, [isHovered]);

  const handleRawView = () => {
    setShowRaw(true);
  };

  const handleEnhanceOrReset = () => {
    if (showRaw) {
      setShowRaw(false);
      setShowRefreshIcon(false);
      setShowTemplatePopover(false);
      return;
    }

    if (isEnhancing) {
      handleCancel();
    } else {
      handleEnhance();
    }
  };

  const showPopover = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (!showRaw && !isEnhancing && showRefreshIcon) {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setShowTemplatePopover(true);
    }
  };

  const hidePopover = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTemplatePopover(false);
    }, 100);
  };

  const handleTemplateSelect = (templateId: string) => {
    setShowTemplatePopover(false);

    if (templateId !== "auto") {
      safeAnalyticsEvent({
        event: "custom_template_enhancement_started",
        distinct_id: userId,
      });
    }

    handleEnhanceWithTemplate(templateId);
  };

  const handleAddTemplate = async () => {
    setShowTemplatePopover(false);
    try {
      queryClient.invalidateQueries({ queryKey: ["templates"] });

      await openSettingsWindow("/app/settings?tab=templates");

      const handleWindowFocus = () => {
        queryClient.invalidateQueries({ queryKey: ["templates"] });
        window.removeEventListener("focus", handleWindowFocus);
      };

      window.addEventListener("focus", handleWindowFocus);
    } catch (error) {
      console.error("Failed to open settings/templates:", error);
    }
  };

  const handleNewTemplate = async () => {
    setShowTemplatePopover(false);
    try {
      queryClient.invalidateQueries({ queryKey: ["templates"] });

      await openSettingsWindow("/app/settings?tab=templates&action=new-template");

      const handleWindowFocus = () => {
        queryClient.invalidateQueries({ queryKey: ["templates"] });
        window.removeEventListener("focus", handleWindowFocus);
      };

      window.addEventListener("focus", handleWindowFocus);
    } catch (error) {
      console.error("Failed to open new template editor:", error);
    }
  };

  if (isError) {
    const errorRetryButtonClasses = cn(
      "rounded-3xl border",
      "border-border px-4 py-2.5 transition-all ease-in-out",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      "hover:scale-105 transition-transform duration-200",
    );

    return (
      <button
        onClick={handleEnhance}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={errorRetryButtonClasses}
      >
        <RunOrRerun showRefresh={isHovered} showRaw={showRaw} />
      </button>
    );
  }

  if (!session.enhanced_memo_html && !isEnhancing) {
    return null;
  }

  const rawButtonClasses = cn(
    "rounded-l-3xl border-l border-y",
    "border-border px-4 py-2.5 transition-all ease-in-out",
    showRaw
      ? "bg-primary text-primary-foreground border-primary hover:bg-primary"
      : "bg-background text-muted-foreground/70 hover:bg-surface-400",
  );

  const enhanceButtonClasses = cn(
    "rounded-r-3xl border-r border-y",
    "border border-border px-4 py-2.5 transition-all ease-in-out",
    showRaw
      ? "bg-background text-muted-foreground/70 hover:bg-surface-400"
      : "bg-primary text-primary-foreground border-primary hover:bg-foreground/80",
  );

  const showRefresh = !showRaw && (isHovered || showTemplatePopover) && showRefreshIcon;
  const shouldShowProgress = showProgress && progress < 1.0;
  const templateMenuItemClass = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
    "text-popover-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
  );
  const templateMenuActionClass = cn(
    templateMenuItemClass,
    "text-muted-foreground hover:text-accent-foreground",
  );
  const templateMenuSeparatorClass = "-mx-1 my-1 h-px bg-muted";

  // Original toggle UI
  // @ts-ignore - keeping for potential future use
  const originalToggle = (
    <div className="flex w-fit flex-row items-center group hover:scale-105 transition-transform duration-200">
      <button
        disabled={isEnhancing}
        onClick={handleRawView}
        className={rawButtonClasses}
      >
        <div className="flex items-center justify-center">
          <i className="ri-file-2-line" style={{ fontSize: "22px" }} />
        </div>
      </button>

      <Popover open={showTemplatePopover && !showRaw && !isEnhancing} onOpenChange={setShowTemplatePopover}>
        <PopoverTrigger asChild>
          <button
            onMouseEnter={() => {
              setIsHovered(true);
              showPopover();
            }}
            onMouseLeave={() => {
              setIsHovered(false);
              hidePopover();
            }}
            onClick={handleEnhanceOrReset}
            className={enhanceButtonClasses}
          >
            {isEnhancing
              ? isHovered
                ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center">
                      <i className="ri-close-line" style={{ fontSize: "22px" }} />
                    </div>
                    {shouldShowProgress && (
                      <span className="text-xs font-mono">
                        {Math.round(progress * 100)}%
                      </span>
                    )}
                  </div>
                )
                : (
                  <div className="flex items-center gap-2">
                    <Loader variant="dots" size="sm" />
                    {shouldShowProgress && (
                      <span className="text-xs font-mono">
                        {Math.round(progress * 100)}%
                      </span>
                    )}
                  </div>
                )
              : <RunOrRerun showRefresh={showRefresh} isEnhancing={isEnhancing} showRaw={showRaw} />}
          </button>
        </PopoverTrigger>

        <PopoverContent
          side="top"
          align="center"
          className="w-48 p-0"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={showPopover}
          onMouseLeave={hidePopover}
        >
          <div className="max-h-64 overflow-y-auto p-1">
            <button
              type="button"
              className={templateMenuActionClass}
              onClick={handleAddTemplate}
            >
              <i className="ri-layout-grid-line text-base text-muted-foreground" />
              <span className="truncate">
                <Trans>All templates...</Trans>
              </span>
            </button>

            <button
              type="button"
              className={templateMenuActionClass}
              onClick={handleNewTemplate}
            >
              <i className="ri-add-line text-base text-muted-foreground" />
              <span className="truncate">
                <Trans>New template</Trans>
              </span>
            </button>

            {/* Separator */}
            <div className={templateMenuSeparatorClass} />

            {/* Auto option */}
            <button
              type="button"
              className={templateMenuItemClass}
              onClick={() => handleTemplateSelect("auto")}
            >
              <Icon name="ri-sparkling-line" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">Auto</span>
            </button>

            {/* Show separator and custom templates only if custom templates exist */}
            {templates.length > 0 && (
              <>
                <div className={templateMenuSeparatorClass} />
                {templates.map((template) => {
                  const translatedTitle = getTemplateTitle(template);
                  const name = getTemplateDisplayName(translatedTitle, t`Untitled Template`);

                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={templateMenuItemClass}
                      onClick={() => handleTemplateSelect(template.id)}
                    >
                      <TemplateIcon template={template} className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  // Get current selected template info for display
  const getCurrentTemplateInfo = () => {
    if (!currentTemplateId || currentTemplateId === "auto") {
      return { name: "Auto" };
    }

    const selectedTemplate = templates.find(t => t.id === currentTemplateId);
    if (selectedTemplate) {
      return {
        name: truncateTemplateName(getTemplateDisplayName(selectedTemplate.title, t`Untitled Template`)),
      };
    }

    return { name: "Auto" };
  };

  // Helper function to truncate template names for display in the floating dock
  const truncateTemplateName = (name: string, maxLength: number = 12) => {
    if (name.length <= maxLength) {
      return name;
    }
    return name.substring(0, maxLength - 1).trim() + "…";
  };

  const currentTemplate = getCurrentTemplateInfo();

  // Dock version with elegant Motion animations
  const dockToggle = (
    <div className=" w-full flex justify-center">
      <motion.div
        className="flex w-fit bg-background/80 border backdrop-blur-md rounded-full p-1 gap-1 shadow-sm hover:shadow-md transition-all"
        initial={false}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {/* Private/Raw view button */}
        <motion.button
          disabled={isEnhancing}
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200",
            isEnhancing
              ? "opacity-50 cursor-not-allowed"
              : showRaw
              ? "bg-primary text-primary-foreground"
              : "hover:bg-surface-400 hover:scale-105",
          )}
          onClick={handleRawView}
          whileHover={{ scale: showRaw ? 1 : 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={showRaw ? "document-active" : "document-inactive"}
              initial={{ scale: 0.8, opacity: 0, rotate: showRaw ? -5 : 5 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0, rotate: showRaw ? 5 : -5 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <div className="flex items-center justify-center">
                <i className="ri-align-left" style={{ fontSize: "22px" }} />
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.button>

        {/* AI Enhanced view button with template display */}
        <div className="flex relative">
          <motion.button
            className={cn(
              "flex items-center gap-2 px-3 h-9 rounded-full transition-all duration-200 min-w-fit",
              !showRaw
                ? "bg-primary text-primary-foreground"
                : "hover:bg-surface-400 hover:scale-105",
            )}
            whileHover={{ scale: !showRaw ? 1 : 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {/* Icon area - ONLY this triggers regenerate hover and click */}
            <motion.div
              className="flex-shrink-0 cursor-pointer"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={handleEnhanceOrReset}
            >
              <AnimatePresence mode="wait">
                {isEnhancing
                  ? (
                    <motion.div
                      key={isHovered ? "cancel" : "loading"}
                      initial={{ scale: 0.8, opacity: 0, rotate: 10 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.8, opacity: 0, rotate: -10 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      {isHovered
                        ? (
                          <div className="flex items-center justify-center">
                            <i className="ri-close-line" style={{ fontSize: "22px" }} />
                          </div>
                        )
                        : <Loader variant="dots" size="sm" />}
                    </motion.div>
                  )
                  : (
                    <motion.div
                      key={!showRaw ? "sparkles-active" : "sparkles-inactive"}
                      initial={{ scale: 0.8, opacity: 0, rotate: !showRaw ? -5 : 5 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.8, opacity: 0, rotate: !showRaw ? 5 : -5 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                      <RunOrRerun showRefresh={showRefresh} isEnhancing={isEnhancing} showRaw={showRaw} />
                    </motion.div>
                  )}
              </AnimatePresence>
            </motion.div>

            {/* Template name display when AI enhanced is selected and not processing */}
            <AnimatePresence>
              {!showRaw && !isEnhancing && (
                <Popover open={showTemplatePopover} onOpenChange={setShowTemplatePopover}>
                  <PopoverTrigger asChild>
                    <motion.div
                      key="template-text"
                      initial={{ width: 0, opacity: 0, x: -10 }}
                      animate={{ width: "auto", opacity: 1, x: 0 }}
                      exit={{ width: 0, opacity: 0, x: -10 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="flex items-center gap-1 cursor-pointer overflow-hidden"
                    >
                      <motion.span
                        className="text-sm font-medium whitespace-nowrap"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1 }}
                      >
                        {currentTemplate.name}
                      </motion.span>
                      <motion.svg
                        className="w-3 h-3 opacity-70"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        initial={{ opacity: 0, rotate: -90 }}
                        animate={{
                          opacity: 1,
                          rotate: showTemplatePopover ? 180 : 0,
                        }}
                        transition={{ duration: 0.2 }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </motion.svg>
                    </motion.div>
                  </PopoverTrigger>

                  <PopoverContent
                    side="top"
                    align="center"
                    className="w-48 p-0"
                    sideOffset={8}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    <div className="max-h-64 overflow-y-auto p-1">
                      <button
                        type="button"
                        className={templateMenuActionClass}
                        onClick={handleAddTemplate}
                      >
                        <i className="ri-layout-grid-line text-base text-muted-foreground" />
                        <span className="truncate">
                          <Trans>All templates...</Trans>
                        </span>
                      </button>

                      <button
                        type="button"
                        className={templateMenuActionClass}
                        onClick={handleNewTemplate}
                      >
                        <i className="ri-add-line text-base text-muted-foreground" />
                        <span className="truncate">
                          <Trans>New template</Trans>
                        </span>
                      </button>

                      {/* Separator */}
                      <div className={templateMenuSeparatorClass} />

                      {/* Auto option */}
                      <button
                        type="button"
                        className={cn(
                          templateMenuItemClass,
                          (currentTemplateId === null || currentTemplateId === "auto")
                            ? "bg-accent text-accent-foreground font-medium"
                            : "",
                        )}
                        onClick={() => handleTemplateSelect("auto")}
                      >
                        <Icon name="ri-sparkling-line" className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">Auto</span>
                        {(currentTemplateId === null || currentTemplateId === "auto") && (
                          <i className="ri-check-line ml-auto text-base text-muted-foreground" />
                        )}
                      </button>

                      {/* Show separator and custom templates only if custom templates exist */}
                      {templates.length > 0 && (
                        <>
                          <div className={templateMenuSeparatorClass} />
                          {templates.map((template) => {
                            const translatedTitle = getTemplateTitle(template);
                            const name = getTemplateDisplayName(translatedTitle, t`Untitled Template`);
                            const isSelected = currentTemplateId === template.id;

                            return (
                              <button
                                key={template.id}
                                type="button"
                                className={cn(
                                  templateMenuItemClass,
                                  isSelected
                                    ? "bg-accent text-accent-foreground font-medium"
                                    : "",
                                )}
                                onClick={() => handleTemplateSelect(template.id)}
                              >
                                <TemplateIcon
                                  template={template}
                                  className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                                />
                                <span className="truncate">{name}</span>
                                {isSelected && <i className="ri-check-line ml-auto text-base text-muted-foreground" />}
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );

  return (
    <div>
      {dockToggle}
      {/* {originalToggle} */}
    </div>
  );
}

function RunOrRerun(
  { showRefresh, isEnhancing, showRaw }: { showRefresh: boolean; isEnhancing?: boolean; showRaw: boolean },
) {
  return (
    <div className="relative h-6 w-6">
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showRefresh ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex items-center justify-center h-full w-full">
          <i className="ri-loop-right-ai-line" style={{ fontSize: "22px" }} />
        </div>
      </div>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showRefresh ? "opacity-0" : "opacity-100",
        )}
      >
        {isEnhancing
          ? <Loader variant="dots" size="sm" />
          : (
            <div className="flex items-center justify-center h-full w-full">
              {!showRaw
                ? <i className="ri-sparkling-fill" style={{ fontSize: "22px" }} />
                : <i className="ri-sparkling-line" style={{ fontSize: "22px" }} />}
            </div>
          )}
      </div>
    </div>
  );
}
