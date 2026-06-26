/**
 * Engine registry — the catalog of workers the kernel can dispatch to.
 *
 * Each engine adapter implements the same minimal contract: `run(step)`
 * returns { ok, output, evidence } or throws. The executor wraps the
 * try/catch + retry policy so engines stay simple.
 *
 * Engine list (alphabetical):
 *   - bos-omega   physical-world commands (remote control / install)
 *   - brain       meta-engine for self-referential operations
 *   - crawl4ai    web research via existing crawl4ai runtime
 *   - docling     document parsing via existing docling runtime
 *   - hermes      memory + skill distillation
 *   - http        raw HTTP requests
 *   - mem0        typed-fact extraction
 *   - openhands   code execution / browser automation
 *   - shell       local shell (sandboxed via pc-agent in production)
 */

import { bosOmegaEngine } from "./bos-omega-engine";
import { brainEngine } from "./brain-engine";
import { crawl4aiEngine } from "./crawl4ai-engine";
import { doclingEngine } from "./docling-engine";
import { hermesEngine } from "./hermes-engine";
import { httpEngine } from "./http-engine";
import { mem0Engine } from "./mem0-engine";
import { openhandsEngine } from "./openhands-engine";
import { shellEngine } from "./shell-engine";
import { tavilySearchEngine } from "./tavily-search-engine";
import type { EngineName } from "@workspace/db";
import type { MissionStep } from "../types";

export interface EngineResult {
  ok: boolean;
  output?: unknown;
  evidence?: string;
  error?: string;
  durationMs: number;
  /** When the engine surfaces structured data the verifier can predicate over. */
  facts?: Record<string, unknown>;
}

export interface EngineAdapter {
  name: EngineName;
  run(step: MissionStep): Promise<EngineResult>;
}

const REGISTRY: Record<EngineName, EngineAdapter> = {
  "brain": brainEngine,
  "hermes": hermesEngine,
  "openhands": openhandsEngine,
  "crawl4ai": crawl4aiEngine,
  "mem0": mem0Engine,
  "docling": doclingEngine,
  "bos-omega": bosOmegaEngine,
  "http": httpEngine,
  "shell": shellEngine,
  "tavily-search": tavilySearchEngine,
};

export function getEngine(name: EngineName): EngineAdapter {
  const a = REGISTRY[name];
  if (!a) throw new Error(`unknown engine: ${name}`);
  return a;
}

export function listEngines(): EngineAdapter[] {
  return Object.values(REGISTRY);
}