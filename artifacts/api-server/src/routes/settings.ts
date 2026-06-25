import { Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();
const settingsPath = path.resolve(process.env["AURA_SETTINGS_FILE"] ?? ".aura-omega-settings.json");

export interface AuraRuntimeSettings {
  primaryPlanner: string;
  runtimeMode: "chat-only" | "governed-autonomous" | "full-auto-dry-run" | "full-auto-approved-tools";
  temperature: number;
  maxAutomaticRisk: "low" | "medium" | "high-human-review" | "never-destructive";
  uploadMode: "all-safe-files" | "images-and-text" | "disabled";
  requireVerificationBeforeDone: boolean;
  neverShowSecretsToModel: boolean;
  askForMissingRequiredFields: boolean;
  pauseForCaptchaOrLogin: boolean;
  branchBeforeGithubPush: boolean;
  noDestructiveProductionActionWithoutApproval: boolean;
  mvpGovernorRequired: boolean;
  /** Custom system personality — prepended to every agent's system prompt when set. */
  systemPersonality?: string;
}

const defaults: AuraRuntimeSettings = {
  primaryPlanner: process.env["KIMI_MODEL"] || "kimi-k2.6",
  runtimeMode: "governed-autonomous",
  temperature: 0.4,
  maxAutomaticRisk: "medium",
  uploadMode: "all-safe-files",
  requireVerificationBeforeDone: true,
  neverShowSecretsToModel: true,
  askForMissingRequiredFields: true,
  pauseForCaptchaOrLogin: true,
  branchBeforeGithubPush: true,
  noDestructiveProductionActionWithoutApproval: true,
  mvpGovernorRequired: true,
};

export function readSettings(): AuraRuntimeSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Partial<AuraRuntimeSettings>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function sanitize(input: Record<string, unknown>): AuraRuntimeSettings {
  const next = { ...readSettings(), ...input } as AuraRuntimeSettings;
  next.temperature = Math.min(1, Math.max(0, Number(next.temperature ?? defaults.temperature)));
  next.mvpGovernorRequired = true;
  next.requireVerificationBeforeDone = true;
  next.neverShowSecretsToModel = true;
  if (typeof next.systemPersonality === "string") {
    next.systemPersonality = next.systemPersonality.slice(0, 32_000);
  }
  return next;
}

router.get("/settings/runtime", (_req, res) => {
  res.json({ settings: readSettings(), writeOnlySecrets: true, mvpGovernorRequired: true });
});

router.put("/settings/runtime", (req, res) => {
  const settings = sanitize(req.body ?? {});
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  res.json({ settings, saved: true });
});

router.get("/settings/personality", (_req, res) => {
  const { systemPersonality } = readSettings();
  res.json({ systemPersonality: systemPersonality ?? "" });
});

router.put("/settings/personality", (req, res) => {
  const text = typeof req.body?.systemPersonality === "string"
    ? req.body.systemPersonality.slice(0, 32_000)
    : "";
  const current = readSettings();
  const updated = { ...current, systemPersonality: text };
  fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
  res.json({ systemPersonality: updated.systemPersonality, saved: true });
});

export default router;
