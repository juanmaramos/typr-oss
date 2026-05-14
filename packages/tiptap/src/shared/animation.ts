import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    streamingAnimation: {
      markNewContent: () => ReturnType;
    };
  }
}

export const StreamingAnimation = Extension.create({
  name: "streamingAnimation",

  addCommands() {
    return {
      markNewContent: () => ({ editor }) => {
        // Disabled per-element animation for smoother streaming UX
        // Text appears naturally like ChatGPT/Claude without fade-in effects
        // The smooth auto-scroll provides all the motion needed

        const editorEl = editor.view.dom;
        const blockElements = editorEl.querySelectorAll("h1, p, ul, ol");

        // Just mark elements as processed, no animation
        blockElements.forEach((el) => {
          if (!el.classList.contains("tiptap-animated")) {
            el.classList.add("tiptap-animated"); // Track processed elements
            // Note: NOT adding "tiptap-animating" - no CSS animation
          }
        });

        return true;
      },
    };
  },
});
