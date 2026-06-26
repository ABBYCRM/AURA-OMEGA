import type { EngineAdapter, EngineResult } from "./registry";
import type { MissionStep } from "../types";
import { parseAndRecord } from "../../docling/runtime";

/**
 * Docling engine — parses documents (PDF/DOCX/HTML/MD) into structured text.
 *
 * Action: "parse" → parseAndRecord({ sourceKind, sourceRef, rawContent })
 */

export const doclingEngine: EngineAdapter = {
  name: "docling",
  async run(step: MissionStep): Promise<EngineResult> {
    const started = Date.now();
    const sourceKind = (step.args.sourceKind as "url" | "upload" | "text") ?? "text";
    const sourceRef = (step.args.sourceRef as string | null) ?? null;
    const rawContent = (step.args.rawContent as string | null) ?? null;
    try {
      const r = await parseAndRecord({
        sourceKind,
        sourceRef,
        rawContent,
        title: (step.args.title as string | undefined) ?? undefined,
        writeToMemory: Boolean(step.args.writeToMemory),
        memoryKey: (step.args.memoryKey as string | null) ?? null,
        memoryTag: (step.args.memoryTag as string | undefined) ?? "mission",
      });
      const ok = !!r.documentId && !r.error;
      return {
        ok,
        output: r,
        evidence: r.result?.extractedText?.slice(0, 200) ?? r.error ?? "",
        durationMs: Date.now() - started,
        facts: { documentId: r.documentId, format: r.result?.format, chars: r.result?.extractedChars },
      };
    } catch (err) {
      return { ok: false, error: String(err).slice(0, 200), durationMs: Date.now() - started };
    }
  },
};