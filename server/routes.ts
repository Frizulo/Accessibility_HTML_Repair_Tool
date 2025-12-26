import type { Express } from "express";
import { type Server } from "http";
import { repairHtml, BUILT_IN_RULES } from "./accessibility-engine";
import { repairRequestSchema } from "@shared/schema";

/**
 * Routes:
 * - POST /api/repair : Analyze + auto-fix HTML fragment with local rules (no external API).
 * - GET  /api/health : Health check.
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/repair", async (req, res) => {
    try {
      const validationResult = repairRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Bad request",
          message: validationResult.error.issues?.[0]?.message || "Invalid request body",
        });
      }

      const { html, config } = validationResult.data;

      let configObj: any = undefined;
      if (config && config.trim()) {
        try {
          configObj = JSON.parse(config);
        } catch {
          return res.status(400).json({
            error: "Bad request",
            message: "config 不是有效的 JSON",
          });
        }
      }

      // Local rule-based engine (works fully offline; no API key needed)
      const result = repairHtml(html, configObj);
      return res.json(result);
    } catch (error) {
      console.error("Repair error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/rules", (_req, res) => {
    res.json({ rules: BUILT_IN_RULES });
  });

  return httpServer;
}
