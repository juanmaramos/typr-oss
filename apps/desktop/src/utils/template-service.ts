import { debugLogFor } from "@/components/utils/debug-logger";
import type { Template } from "@typr/plugin-db";
import { commands as dbCommands } from "@typr/plugin-db";
import { DEFAULT_TEMPLATES, isDefaultTemplate } from "./default-templates";

export class TemplateService {
  static async getAllTemplates(): Promise<Template[]> {
    try {
      const dbTemplates = await dbCommands.listTemplates();

      const filteredDbTemplates = dbTemplates.filter(t => !isDefaultTemplate(t.id));

      return [...DEFAULT_TEMPLATES, ...filteredDbTemplates];
    } catch (error) {
      console.error("Failed to load database templates:", error);

      return DEFAULT_TEMPLATES;
    }
  }

  static async getTemplate(templateId: string): Promise<Template | null> {
    const hardcodedTemplate = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    if (hardcodedTemplate) {
      return hardcodedTemplate;
    }

    try {
      const dbTemplates = await dbCommands.listTemplates();
      return dbTemplates.find(t => t.id === templateId) || null;
    } catch (error) {
      console.error("Failed to load database template:", error);
      return null;
    }
  }

  static async getTemplatesByCategory(): Promise<{
    custom: Template[];
    builtin: Template[];
  }> {
    const allTemplates = await this.getAllTemplates();

    return {
      custom: allTemplates.filter(t => !t.tags?.includes("builtin")),
      builtin: allTemplates.filter(t => t.tags?.includes("builtin")),
    };
  }

  static canEditTemplate(templateId: string): boolean {
    return !isDefaultTemplate(templateId);
  }

  static async saveTemplate(template: Template): Promise<Template> {
    if (isDefaultTemplate(template.id)) {
      throw new Error("Cannot save built-in template");
    }

    return await dbCommands.upsertTemplate(template);
  }

  static async deleteTemplate(templateId: string): Promise<void> {
    if (isDefaultTemplate(templateId)) {
      throw new Error("Cannot delete built-in template");
    }

    await dbCommands.deleteTemplate(templateId);
  }

  // Favorite-related methods
  static async getFavoriteTemplates(): Promise<Template[]> {
    try {
      const favoriteIds = await dbCommands.getFavoriteTemplates();
      const allTemplates = await this.getAllTemplates();

      return allTemplates.filter(template => favoriteIds.includes(template.id));
    } catch (error) {
      console.error("Failed to load favorite templates:", error);
      return [];
    }
  }

  static async toggleTemplateFavorite(templateId: string, isFavorite: boolean): Promise<void> {
    try {
      await dbCommands.toggleTemplateFavorite(templateId, isFavorite);
    } catch (error) {
      console.error("Failed to toggle template favorite:", error);
      throw error;
    }
  }

  static async isFavoriteTemplate(templateId: string): Promise<boolean> {
    try {
      return await dbCommands.isTemplateFavorited(templateId);
    } catch (error) {
      console.error("Failed to check template favorite status:", error);
      return false;
    }
  }

  static async initializeDefaultFavorites(): Promise<void> {
    try {
      // Auto-favorite the core templates on first use
      const defaultFavorites = [
        "default-meeting-notes", // 📝 General Meeting
        "default-one-on-one", // 👥 1-on-1 Meeting
        "default-customer-call", // 📞 Customer Call
        "default-job-interview", // 💼 Job Interview
      ];

      // Check if user already has favorites
      const existingFavorites = await dbCommands.getFavoriteTemplates();

      // Only auto-favorite if user has no favorites yet
      if (existingFavorites.length === 0) {
        for (const templateId of defaultFavorites) {
          await dbCommands.toggleTemplateFavorite(templateId, true);
        }
        console.log("Initialized default favorite templates");
      }
    } catch (error) {
      console.error("Failed to initialize default favorites:", error);
    }
  }

  static async getTemplatesForPopover(selectedTemplateId?: string | null): Promise<Template[]> {
    try {
      debugLogFor("DEBUG_TEMPLATES", "TemplateDebug", "get templates for popover", { selectedTemplateId });

      const favorites = await this.getFavoriteTemplates();

      let templates = favorites.length > 0 ? favorites : [];

      // If no favorites, use the core default templates
      if (templates.length === 0) {
        // Use console.debug for less spam
        const allTemplates = await this.getAllTemplates();
        const defaultIds = [
          "default-meeting-notes",
          "default-one-on-one",
          "default-customer-call",
          "default-job-interview",
        ];
        templates = allTemplates.filter(template => defaultIds.includes(template.id));
      }

      // Always ensure the selected template is included (if it exists and isn't "auto")
      if (selectedTemplateId && selectedTemplateId !== "auto") {
        // Reduced logging
        const isAlreadyIncluded = templates.some(t => t.id === selectedTemplateId);

        if (!isAlreadyIncluded) {
          const selectedTemplate = await this.getTemplate(selectedTemplateId);
          // Template fetched for popover

          if (selectedTemplate) {
            templates.push(selectedTemplate);
            // Template added successfully
          }
        }
      }

      debugLogFor("DEBUG_TEMPLATES", "TemplateDebug", "favorites found", { count: templates.length });
      return templates;
    } catch (error) {
      console.error("❌ Failed to get templates for popover:", error);
      // Fallback to all templates
      return this.getAllTemplates();
    }
  }
}
