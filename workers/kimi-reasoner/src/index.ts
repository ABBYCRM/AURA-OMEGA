/**
 * KIMI-REASONER — Cloudflare Worker
 *
 * Deep reasoning chain worker. Replicates Kimi's multi-step reasoning:
 * 1. Breaks complex problems into reasoning steps
 * 2. Self-corrects when confidence drops
 * 3. Explores multiple solution paths
 * 4. Returns structured reasoning with confidence tracking
 *
 * Uses Cloudflare Workers AI for LLM inference.
 */

export interface Env {
  AI: any;
}

const DEFAULT_MODEL = "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b";
const FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct";

interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  result?: string;
  confidence: number;
}

interface ReasoningChain {
  steps: ReasoningStep[];
  finalAnswer: string;
  overallConfidence: number;
  branchesExplored: number;
  selfCorrections: number;
}

// ─── Reasoning engine ─────────────────────────────────────────────────────────

async function runReasoning(
  ai: any,
  problem: string,
  maxSteps: number,
  minConfidence: number,
): Promise<ReasoningChain> {
  const steps: ReasoningStep[] = [];
  let selfCorrections = 0;
  let branchesExplored = 1;
  let context = `Problem: ${problem}\n\n`;

  for (let stepNum = 1; stepNum <= maxSteps; stepNum++) {
    // Build the reasoning prompt
    const priorSteps = steps.length > 0
      ? `Previous reasoning:\n${steps.map((s) => `Step ${s.step}: ${s.thought}${s.result ? `\nResult: ${s.result}` : ""}\nConfidence: ${s.confidence}%`).join("\n\n")}\n\n`
      : "";

    const prompt = `${priorSteps}${context}Step ${stepNum}: What should I think about next? Provide your reasoning, any calculation, and a confidence score (0-100). If you spot an error in prior reasoning, note it and correct. Format:
THOUGHT: <your reasoning>
ACTION: <what to do next, or "conclude" if done>
RESULT: <any calculation or finding>
CONFIDENCE: <0-100>`;

    const messages: any[] = [
      {
        role: "system",
        content: `You are a deep reasoning engine. Think step-by-step. Show your work. Be precise with numbers. When uncertain, say so. Self-correct when you spot errors.`,
      },
      { role: "user", content: prompt },
    ];

    let response: any;
    try {
      response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 1024 });
    } catch {
      // Fallback to Llama if DeepSeek fails
      response = await ai.run(FALLBACK_MODEL, { messages, max_tokens: 1024 });
    }

    const text = response.response?.trim() || "";

    // Parse the structured response
    const thoughtMatch = text.match(/THOUGHT:\s*(.+?)(?=ACTION:|RESULT:|CONFIDENCE:|$)/is);
    const actionMatch = text.match(/ACTION:\s*(.+?)(?=RESULT:|CONFIDENCE:|$)/is);
    const resultMatch = text.match(/RESULT:\s*(.+?)(?=CONFIDENCE:|$)/is);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/i);

    const thought = thoughtMatch ? thoughtMatch[1].trim() : text.slice(0, 300);
    const action = actionMatch ? actionMatch[1].trim().toLowerCase() : "continue";
    const result = resultMatch ? resultMatch[1].trim() : "";
    const confidence = confidenceMatch
      ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1])))
      : 50;

    steps.push({ step: stepNum, thought, action, result, confidence });

    // Self-correction detection: if confidence drops, note it
    if (stepNum > 1 && confidence < steps[stepNum - 2].confidence - 20) {
      selfCorrections++;
      context += `\n[Self-correction triggered at step ${stepNum} — confidence dropped to ${confidence}%]\n`;
    }

    // Branch exploration: if stuck, try alternative approach
    if (stepNum > 2 && confidence < minConfidence && action !== "conclude") {
      branchesExplored++;
      context += `\n[Exploring alternative approach — current path has low confidence (${confidence}%)]\n`;
    }

    // Termination conditions
    if (action === "conclude" || action.includes("done") || action.includes("answer")) {
      break;
    }

    if (stepNum >= maxSteps) {
      break;
    }
  }

  // Final synthesis
  const finalAnswer = await synthesizeFinal(ai, problem, steps);
  const overallConfidence = Math.round(
    steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length,
  );

  return {
    steps,
    finalAnswer,
    overallConfidence,
    branchesExplored,
    selfCorrections,
  };
}

async function synthesizeFinal(
  ai: any,
  problem: string,
  steps: ReasoningStep[],
): Promise<string> {
  const chainText = steps
    .map((s) => `Step ${s.step} (${s.confidence}%): ${s.thought}${s.result ? `\n→ ${s.result}` : ""}`)
    .join("\n\n");

  const messages: any[] = [
    {
      role: "system",
      content: `You are a reasoning synthesis engine. Given a chain of reasoning steps, produce a clear final answer. Include the key insights, any caveats, and confidence level.`,
    },
    {
      role: "user",
      content: `Problem: ${problem}\n\nReasoning chain:\n\n${chainText}\n\nSynthesize the final answer.`,
    },
  ];

  try {
    const response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 1024 });
    return response.response?.trim() || "";
  } catch {
    const response = await ai.run(FALLBACK_MODEL, { messages, max_tokens: 1024 });
    return response.response?.trim() || "";
  }
}

// ─── Worker entrypoint ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: corsHeaders });
    }

    let body: { problem?: string; maxSteps?: number; minConfidence?: number };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
    }

    const problem = body.problem?.trim();
    if (!problem) {
      return new Response(JSON.stringify({ error: "problem is required" }), { status: 400, headers: corsHeaders });
    }

    try {
      const maxSteps = Math.min(Math.max(body.maxSteps || 8, 2), 20);
      const minConfidence = Math.min(Math.max(body.minConfidence || 60, 0), 100);

      const chain = await runReasoning(env.AI, problem, maxSteps, minConfidence);

      return new Response(
        JSON.stringify({
          problem,
          ...chain,
          model: DEFAULT_MODEL,
          fallbackModel: FALLBACK_MODEL,
          worker: "kimi-reasoner",
        }, null, 2),
        { headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message, worker: "kimi-reasoner" }),
        { status: 500, headers: corsHeaders },
      );
    }
  },
};
