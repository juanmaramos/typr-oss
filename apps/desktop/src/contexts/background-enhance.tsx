import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useTypr } from "@/contexts";
import { resolveNoteTitle } from "@/lib/note-title";
import { useAudioUploadStore } from "@/stores/audio-upload";
import { TemplateService } from "@/utils/template-service";
import { commands as configCommands } from "@typr/plugin-config";
import { commands as dbCommands, type Session } from "@typr/plugin-db";
import { commands as miscCommands } from "@typr/plugin-misc";
import { commands as templateCommands, type Grammar } from "@typr/plugin-template";
import { CLOUD_GENERATION_TOKEN_BUDGETS } from "@typr/utils";
import { generateText, getTemplateTypeForTask, localProviderName, modelProvider, streamText } from "@typr/utils/ai";
import { useSessions } from "@typr/utils/contexts";

const ENHANCE_MIN_WORDS = 5;
const POLL_INTERVAL_MS = 5_000;

export function BackgroundEnhanceWorker({ children }: { children: React.ReactNode }) {
  const { userId } = useTypr();
  const sessionsStore = useSessions((s) => s.sessions);
  const processingRef = useRef(false);
  const queryClient = useQueryClient();

  const processSession = useCallback(async (session: Session) => {
    const freshSession = await dbCommands.getSession({ id: session.id });
    if (!freshSession?.needs_enhance) {
      console.log(`[BackgroundEnhance] Skipping — session already claimed ${session.id}`);
      return;
    }

    session = freshSession;

    if (session.words.length < ENHANCE_MIN_WORDS) {
      console.log(`[BackgroundEnhance] Skipping — only ${session.words.length} words`);
      await dbCommands.upsertSession({ ...session, needs_enhance: false });
      return;
    }

    await dbCommands.upsertSession({ ...session, needs_enhance: false });
    const loadedSessionStore = sessionsStore[session.id];
    if (loadedSessionStore) {
      await loadedSessionStore.getState().refresh();
    }

    console.log(`[BackgroundEnhance] Processing session ${session.id}`);

    try {
      const [general, templateType] = await Promise.all([
        configCommands.getGeneralConfig(),
        getTemplateTypeForTask("meetingSummary"),
      ]);

      const config = { general };
      const isLocalLlm = templateType === "TyprLocal";

      const isYoutube = session.source_type === "youtube";
      const templateKeys = {
        system: isYoutube ? "enhance_youtube.system" : "enhance.system",
        user: isYoutube ? "enhance_youtube.user" : "enhance.user",
      };

      const selectedTemplateId = general.selected_template_id ?? null;
      const selectedTemplate = selectedTemplateId
        ? await TemplateService.getTemplate(selectedTemplateId)
        : null;
      const grammarSections = selectedTemplate?.sections.map(section => section.title) ?? null;
      console.info("[TemplateTrace] background:resolved", {
        session_id: session.id,
        source_type: session.source_type,
        selected_template_id: selectedTemplateId,
        resolved_template_id: selectedTemplate?.id ?? null,
        section_count: selectedTemplate?.sections.length ?? 0,
        system_template: templateKeys.system,
      });

      const [systemMessage, userMessage] = await Promise.all([
        templateCommands.render(templateKeys.system, {
          config,
          type: templateType,
          templateInfo: selectedTemplate,
        }),
        templateCommands.render(templateKeys.user, {
          type: templateType,
          editor: "",
          words: JSON.stringify(session.words),
          participants: await dbCommands.sessionListParticipants(session.id),
          templateInfo: selectedTemplate,
        }),
      ]);

      const provider = await modelProvider(undefined, { includeOnboardingModel: false, task: "meetingSummary" });
      const model = provider.languageModel("defaultModel");
      const abortSignal = AbortSignal.timeout(120_000);

      const { fullStream } = streamText({
        abortSignal,
        model,
        maxTokens: CLOUD_GENERATION_TOKEN_BUDGETS.meetingNotes,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: userMessage },
        ],
        ...(isLocalLlm && {
          providerOptions: {
            [localProviderName]: {
              metadata: {
                grammar: { task: "enhance", sections: grammarSections } satisfies Grammar,
              },
            },
          },
        }),
      });

      let acc = "";
      for await (const chunk of fullStream) {
        if (chunk.type === "text-delta") {
          acc += chunk.textDelta;
        }
      }

      if (!acc.trim()) {
        console.error(`[BackgroundEnhance] Empty result for ${session.id}`);
        await dbCommands.upsertSession({ ...session, needs_enhance: false });
        return;
      }

      const finalHtml = await miscCommands.opinionatedMdToHtml(acc);

      await dbCommands.upsertSession({
        ...session,
        auto_enhanced_memo_html: finalHtml,
        enhanced_memo_html: finalHtml,
        needs_enhance: false,
      });

      // Refresh session store if loaded
      const sessionStore = sessionsStore[session.id];
      if (sessionStore) {
        await sessionStore.getState().refresh();
      }

      console.log(`[BackgroundEnhance] Enhanced session ${session.id} (${acc.length} chars)`);

      // Update toast if this was the session being uploaded
      const uploadState = useAudioUploadStore.getState().progress;
      if (uploadState.status === "done" && uploadState.sessionId === session.id) {
        useAudioUploadStore.getState().setProgress({ status: "enhanced", sessionId: session.id });
      }

      // Refresh sidebar list
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });

      // Generate title (fire-and-forget)
      generateTitleForSession(finalHtml, session, sessionsStore, queryClient).catch((e) =>
        console.error("[BackgroundEnhance] Title generation failed:", e)
      );
    } catch (error) {
      console.error(`[BackgroundEnhance] Failed for session ${session.id}:`, error);

      // Clear stuck toast — if upload store is waiting for this session's enhance, reset it
      const uploadState = useAudioUploadStore.getState().progress;
      if (uploadState.status === "done" && uploadState.sessionId === session.id) {
        useAudioUploadStore.getState().setProgress({ status: "idle" });
      }
    }
  }, [sessionsStore, queryClient]);

  const pollAndProcess = useCallback(async () => {
    if (processingRef.current || !userId) {
      return;
    }

    try {
      const pending = await dbCommands.listSessions({
        type: "needsEnhance",
        user_id: userId,
        limit: 10,
      });

      if (pending.length === 0) {
        return;
      }

      processingRef.current = true;
      console.log(`[BackgroundEnhance] Found ${pending.length} session(s) to enhance`);

      for (const session of pending) {
        await processSession(session);
      }
    } catch (error) {
      console.error("[BackgroundEnhance] Poll error:", error);
    } finally {
      processingRef.current = false;
    }
  }, [userId, processSession]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    // Initial check
    const timeout = setTimeout(pollAndProcess, 2_000);

    // Periodic polling
    const interval = setInterval(pollAndProcess, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [userId, pollAndProcess]);

  return <>{children}</>;
}

async function generateTitleForSession(
  enhancedContent: string,
  session: Session,
  sessions: Record<string, any>,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const shouldGenerateTitle = !session.title || session.source_type === "youtube";
  if (!shouldGenerateTitle) {
    return;
  }

  const [config, provider, templateType] = await Promise.all([
    configCommands.getGeneralConfig(),
    modelProvider(undefined, { includeOnboardingModel: false, task: "meetingSummary" }),
    getTemplateTypeForTask("meetingSummary"),
  ]);
  const isLocalLlm = templateType === "TyprLocal";

  const [systemMessage, userMessage] = await Promise.all([
    templateCommands.render("create_title.system", { config: { general: config }, type: templateType }),
    templateCommands.render("create_title.user", { type: templateType, enhanced_note: enhancedContent }),
  ]);

  const model = provider.languageModel("defaultModel");
  const abortSignal = AbortSignal.timeout(60_000);

  const { text } = await generateText({
    abortSignal,
    model,
    maxTokens: CLOUD_GENERATION_TOKEN_BUDGETS.title,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    ...(isLocalLlm && {
      providerOptions: {
        [localProviderName]: {
          metadata: {
            grammar: { task: "title" } satisfies Grammar,
          },
        },
      },
    }),
  });

  const resolvedTitle = resolveNoteTitle({
    generatedTitle: text,
    enhancedContent,
    existingTitle: session.title,
  });

  if (!resolvedTitle) {
    console.warn("[BackgroundEnhance] Generated title was unusable and no fallback was available", { rawTitle: text });
    return;
  }

  // Fetch fresh session from DB to avoid overwriting concurrent changes
  const freshSession = await dbCommands.getSession({ id: session.id });
  if (!freshSession) {
    return;
  }

  await dbCommands.upsertSession({ ...freshSession, title: resolvedTitle.title });

  const sessionStore = sessions[session.id];
  if (sessionStore) {
    await sessionStore.getState().refresh();
  }

  console.log(`[BackgroundEnhance] Title generated: "${resolvedTitle.title}"`);
  if (resolvedTitle.source !== "generated") {
    console.warn("[BackgroundEnhance] Replaced unusable generated title with fallback", {
      rawTitle: text,
      fallbackSource: resolvedTitle.source,
      fallbackTitle: resolvedTitle.title,
    });
  }

  // Refresh sidebar to show the new title
  await queryClient.invalidateQueries({ queryKey: ["sessions"] });
}
