import { type Event, type Human, type Session } from "@typr/plugin-db";

export interface FormattedContent {
  title: string;
  content: string;
  metadata: string;
  attribution: string;
  isHtml?: boolean;
}

// Clean and preserve HTML formatting for email (KISS approach)
// const cleanHtmlForEmail = (html: string): string => {
//   if (!html) return "";
//
//   const tempDiv = document.createElement("div");
//   tempDiv.innerHTML = html;
//
//   // Simple approach: preserve most common formatting, remove complex styling
//   const allowedTags = ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'];
//   const elements = tempDiv.querySelectorAll('*');
//
//   Array.from(elements).forEach(element => {
//     const tagName = element.tagName.toLowerCase();
//
//     if (!allowedTags.includes(tagName)) {
//       // Replace with span to preserve content but remove unsupported tags
//       const span = document.createElement('span');
//       span.innerHTML = element.innerHTML;
//       element.parentNode?.replaceChild(span, element);
//     } else {
//       // Remove all attributes except essential style for email compatibility
//       Array.from(element.attributes).forEach(attr => {
//         element.removeAttribute(attr.name);
//       });
//     }
//   });
//
//   return tempDiv.innerHTML;
// };

// Format session metadata as HTML
// const formatMetadataAsHtml = (session: Session, participants: Human[], event: Event | null): string => {
//   const items: string[] = [];
//
//   // Creation date (if no event)
//   if (!event && session.created_at) {
//     items.push(`Created: ${new Date(session.created_at).toLocaleDateString()}`);
//   }
//
//   // Event info
//   if (event) {
//     if (event.name) {
//       items.push(`Event: ${event.name}`);
//     }
//
//     if (event.start_date) {
//       const startDate = new Date(event.start_date);
//       const endDate = event.end_date ? new Date(event.end_date) : null;
//
//       let dateText = `Date: ${startDate.toLocaleDateString()}`;
//       if (endDate && startDate.toDateString() !== endDate.toDateString()) {
//         dateText += ` - ${endDate.toLocaleDateString()}`;
//       }
//       items.push(dateText);
//
//       // Time
//       const timeText = endDate
//         ? `Time: ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${
//           endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
//         }`
//         : `Time: ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
//       items.push(timeText);
//     }
//   }
//
//   // Participants
//   if (participants && participants.length > 0) {
//     const participantNames = participants
//       .filter(p => p.full_name)
//       .map(p => p.full_name)
//       .join(", ");
//
//     if (participantNames) {
//       items.push(`Participants: ${participantNames}`);
//     }
//   }
//
//   return items.length > 0 ? `<p style="color: #666; font-size: 14px; margin: 16px 0;">${items.join(" • ")}</p>` : "";
// };

// Convert HTML to formatted plain text for email compatibility
const htmlToFormattedText = (html: string): string => {
  if (!html) {
    return "No content available";
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  let result = "";

  const processNode = (node: Node, indent = ""): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        result += text;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      switch (tagName) {
        case "h1":
          result += `\n\n## ${element.textContent?.trim()}\n`;
          break;
        case "h2":
          result += `\n\n### ${element.textContent?.trim()}\n`;
          break;
        case "h3":
          result += `\n\n#### ${element.textContent?.trim()}\n`;
          break;
        case "strong":
        case "b":
          result += `**${element.textContent?.trim()}**`;
          break;
        case "em":
        case "i":
          result += `*${element.textContent?.trim()}*`;
          break;
        case "li":
          result += `\n• ${element.textContent?.trim()}`;
          break;
        case "ul":
        case "ol":
          result += "\n";
          Array.from(element.children).forEach(child => processNode(child, indent));
          result += "\n";
          return; // Skip normal processing
        case "p":
          if (element.textContent?.trim()) {
            result += "\n\n";
            Array.from(element.childNodes).forEach(child => processNode(child, indent));
          }
          return; // Skip normal processing
        case "br":
          result += "\n";
          break;
        default:
          // For other elements, process children
          Array.from(element.childNodes).forEach(child => processNode(child, indent));
          break;
      }
    }
  };

  Array.from(tempDiv.childNodes).forEach(node => processNode(node));

  // Clean up extra whitespace
  return result.replace(/\n{3,}/g, "\n\n").trim();
};

// Format metadata as plain text with separators
const formatMetadataAsText = (session: Session, participants: Human[], event: Event | null): string => {
  const items: string[] = [];

  // Event info
  if (event) {
    if (event.name) {
      items.push(`Event: ${event.name}`);
    }

    if (event.start_date) {
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : null;

      let dateText = `Date: ${startDate.toLocaleDateString()}`;
      if (endDate && startDate.toDateString() !== endDate.toDateString()) {
        dateText += ` - ${endDate.toLocaleDateString()}`;
      }
      items.push(dateText);

      // Time
      const timeText = endDate
        ? `Time: ${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })} - ${
          endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })
        }`
        : `Time: ${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })}`;
      items.push(timeText);
    }
  }

  // Participants
  if (participants && participants.length > 0) {
    const participantNames = participants
      .filter(p => p.full_name)
      .map(p => p.full_name)
      .join(", ");

    if (participantNames) {
      items.push(`Participants: ${participantNames}`);
    }
  }

  return items.length > 0 ? `\n${items.join(" • ")}\n` : "";
};

export const formatSessionForSharing = (
  session: Session,
  participants: Human[],
  event: Event | null,
  format: "email" | "text" = "email",
): FormattedContent => {
  const title = session.title || "New note";

  if (format === "email") {
    // Plain text format optimized for email (mailto: compatibility)
    const content = htmlToFormattedText(session.enhanced_memo_html || "");
    const metadata = formatMetadataAsText(session, participants, event);
    const attribution = `\n${"─".repeat(50)}\nSummarized with Typr - Offline AI note-taking.\nhttps://www.typrapp.com`;

    return {
      title,
      content,
      metadata,
      attribution,
      isHtml: false,
    };
  } else {
    // Plain text format (for other uses)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = session.enhanced_memo_html || "";
    const content = tempDiv.textContent || tempDiv.innerText || "No content available";
    const metadata = formatMetadataAsText(session, participants, event);
    const attribution = "Summarized with Typr - Offline AI note-taking.\nhttps://www.typrapp.com";

    return {
      title,
      content,
      metadata,
      attribution,
      isHtml: false,
    };
  }
};
