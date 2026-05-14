import { SearchAndReplace } from "@sereneinserenade/tiptap-search-and-replace";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { AIHighlight } from "../editor/extensions/ai-selection-highlight";
import { DiffMark } from "../editor/extensions/diff-mark";
import { OnboardingVideoNode } from "../renderer/nodes";
import { StreamingAnimation } from "./animation";
import { ClipboardTextSerializer } from "./clipboard";
import CustomListKeymap from "./custom-list-keymap";
import { Hashtag } from "./hashtag";

// Add SearchAndReplace commands to TipTap's command interface
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (s: string) => ReturnType;
      setReplaceTerm: (s: string) => ReturnType;
      replaceAll: () => ReturnType;
      resetIndex: () => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replace: () => ReturnType;
    };
  }
}

export const getExtensions = (placeholderText: string = "Start taking notes...") => [
  StarterKit.configure({
    heading: {
      levels: [2, 3],
    },
  }),
  Image,
  Underline,
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === "paragraph") {
        return placeholderText;
      }

      if (node.type.name === "heading") {
        return "Heading";
      }

      if (node.type.name === "orderedList" || node.type.name === "bulletList" || node.type.name === "listItem") {
        return "List";
      }

      if (node.type.name === "taskList" || node.type.name === "taskItem") {
        return "To-do";
      }

      if (node.type.name === "blockquote") {
        return "Empty quote";
      }

      return "";
    },
    showOnlyWhenEditable: true,
  }),
  Hashtag,
  Link.configure({
    openOnClick: true,
    defaultProtocol: "https",
    isAllowedUri: (url, ctx) => {
      try {
        const parsedUrl = url.includes(":") ? new URL(url) : new URL(`${ctx.defaultProtocol}://${url}`);

        if (!ctx.defaultValidate(parsedUrl.href)) {
          return false;
        }

        const disallowedProtocols = ["ftp", "file", "mailto"];
        const protocol = parsedUrl.protocol.replace(":", "");

        if (disallowedProtocols.includes(protocol)) {
          return false;
        }

        const allowedProtocols = ctx.protocols.length > 0
          ? ctx.protocols.map(p => (typeof p === "string" ? p : p.scheme))
          : ["http", "https"];

        if (!allowedProtocols.includes(protocol)) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
    shouldAutoLink: (url) => url.startsWith("https://") || url.startsWith("http://"),
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Highlight,
  CustomListKeymap,
  StreamingAnimation,
  ClipboardTextSerializer,
  OnboardingVideoNode,
  DiffMark, // For inline AI change highlighting
  AIHighlight, // For persistent selection context (Cursor-style)
  SearchAndReplace.configure({
    searchResultClass: "search-result",
    disableRegex: true,
  }),
];

export { extractHashtags } from "./hashtag";
