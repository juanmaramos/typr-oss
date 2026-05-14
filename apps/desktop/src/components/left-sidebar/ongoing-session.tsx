import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";

import { useTyprSearch } from "@/contexts";
import { useSession } from "@typr/utils/contexts";

export default function OngoingSession({
  sessionId,
}: {
  sessionId: string;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const session = useSession(sessionId, (s) => s.session);

  const { setQuery } = useTyprSearch((s) => ({
    setQuery: s.setQuery,
  }));

  const handleClick = () => {
    setQuery("");

    navigate({
      to: "/app/note/$id",
      params: { id: sessionId },
    });
  };

  return (
    <motion.div
      key={sessionId}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="p-2 mb-4"
    >
      <button
        onClick={handleClick}
        className="w-full flex items-center justify-between transition-all bg-foreground hover:bg-foreground/70 px-3 py-2.5 rounded-lg hover:scale-95 duration-300"
      >
        <div className="font-medium text-sm text-background max-w-[180px] truncate">
          {session.title || t`New note`}
        </div>

        <div className="relative h-2 w-2">
          <div className="absolute inset-0 rounded-full bg-destructive/30"></div>
          <div className="absolute inset-0 rounded-full bg-destructive animate-ping opacity-75"></div>
        </div>
      </button>
    </motion.div>
  );
}
