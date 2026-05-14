import { writeText as writeTextToClipboard } from "@tauri-apps/plugin-clipboard-manager";

import { commands as dbCommands, type Session } from "@typr/plugin-db";
import { formatSessionForSharing } from "./content-formatter";

const formatHtmlForClipboard = (html: string): string => {
  if (!html) {
    return "No content available";
  }

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  let result = "";

  const processNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        result += text;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case "h1":
        result += `\n\n# ${element.textContent?.trim()}\n\n`;
        break;
      case "h2":
        result += `\n\n## ${element.textContent?.trim()}\n\n`;
        break;
      case "h3":
        result += `\n\n### ${element.textContent?.trim()}\n\n`;
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
        Array.from(element.children).forEach(processNode);
        result += "\n";
        return;
      case "p":
        if (element.textContent?.trim()) {
          result += "\n\n";
          Array.from(element.childNodes).forEach(processNode);
        }
        return;
      case "br":
        result += "\n";
        break;
      default:
        Array.from(element.childNodes).forEach(processNode);
        break;
    }
  };

  Array.from(tempDiv.childNodes).forEach(processNode);

  return result.replace(/\n{4,}/g, "\n\n\n").trim();
};

export async function buildEmailShareUrl(session: Session): Promise<string> {
  const [participants, event] = await Promise.all([
    dbCommands.sessionListParticipants(session.id),
    dbCommands.sessionGetEvent(session.id),
  ]);

  const formatted = formatSessionForSharing(session, participants || [], event, "email");
  const emailBody = `${formatted.content}${formatted.metadata}${formatted.attribution}`;

  return `mailto:?subject=${encodeURIComponent(formatted.title)}&body=${encodeURIComponent(emailBody)}`;
}

export async function copyAiSummaryToClipboard(session: Session): Promise<void> {
  const [participants, event] = await Promise.all([
    dbCommands.sessionListParticipants(session.id),
    dbCommands.sessionGetEvent(session.id),
  ]);

  const title = session.title || "New note";
  let metadata = "";

  if (event) {
    if (event.name) {
      metadata += `Event: ${event.name}\n`;
    }

    if (event.start_date) {
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : null;

      let dateText = `Date: ${startDate.toLocaleDateString()}`;
      if (endDate && startDate.toDateString() !== endDate.toDateString()) {
        dateText += ` - ${endDate.toLocaleDateString()}`;
      }
      metadata += `${dateText}\n`;

      const timeText = endDate
        ? `Time: ${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })} - ${
          endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })
        }`
        : `Time: ${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: undefined })}`;
      metadata += `${timeText}\n`;
    }
  }

  if (participants && participants.length > 0) {
    const participantNames = participants
      .filter((participant) => participant.full_name)
      .map((participant) => participant.full_name)
      .join(", ");

    if (participantNames) {
      metadata += `Participants: ${participantNames}\n`;
    }
  }

  const formattedContent = formatHtmlForClipboard(session.enhanced_memo_html || "");

  let copyContent = `# ${title}\n`;

  if (metadata) {
    copyContent += `\n${metadata}`;
  }

  copyContent += `\n${"-".repeat(50)}\n`;
  copyContent += formattedContent;
  copyContent += `\n\n${"-".repeat(50)}\nSummarized with Typr - Offline AI note-taking.\nhttps://www.typrapp.com`;

  await writeTextToClipboard(copyContent);
}
