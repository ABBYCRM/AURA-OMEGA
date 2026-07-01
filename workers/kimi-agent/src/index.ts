/**
 * KIMI-AGENT — Cloudflare Worker
 *
 * A general-purpose agentic worker that replicates Kimi's core workflow:
 * 1. Receives a task
 * 2. Plans steps autonomously
 * 3. Executes reasoning chains
 * 4. Returns structured output with evidence
 *
 * Uses Cloudflare Workers AI for LLM inference.
 */

export interface Env {
  AI: any;
}

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct";

const SYSTEM_PROMPT = `You are Kimi-Agent, an autonomous reasoning engine running on Cloudflare Workers AI. Your job is to:

1. PLAN: Break the task into concrete steps
2. EXECUTE: Reason through each step thoroughly
3. VERIFY: Check your own work for errors
4. DELIVER: Return a structured, evidence-based answer

Rules:
- Think step-by-step. Show your reasoning.
- If uncertain, say so — never fabricate facts.
- Use markdown formatting for clarity.
- Always end with a clear conclusion.
- If the task requires external data you don't have, state what information is missing.`;

/**
 * Plan the task into steps using the LLM.
 */
async function planSteps(
  ai: any,
  task: string,
  context?: string,
): Promise<string[]> {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Task: ${task}\n\n${context ? `Context: ${context}\n\n` : ""}Break this task into a numbered list of concrete steps. Return ONLY the steps, one per line, numbered. No preamble or explanation.`,
    },
  ];

  const response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 512 });
  const text = response.response?.trim() || "";

  // Parse numbered lines: "1. Step description"
  const steps = text
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => /^\d+[.\)]\s+/.test(l))
    .map((l: string) => l.replace(/^\d+[.\)]\s+/, "").trim());

  return steps.length > 0 ? steps : [task];
}

/**
 * Execute reasoning for a single step.
 */
async function executeStep(
  ai: any,
  task: string,
  step: string,
  stepNum: number,
  totalSteps: number,
  priorResults: string[],
): Promise<{ result: string; confidence: number }> {
  const priorContext = priorResults.length > 0
    ? `Prior steps completed:\n${priorResults.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n`
    : "";

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${priorContext}Overall task: ${task}\n\nNow executing Step ${stepNum}/${totalSteps}: ${step}\n\nThink through this step carefully. Provide your reasoning, any calculations or analysis, and the result. End with a confidence score (0-100) on a line by itself: "CONFIDENCE: N"`,
    },
  ];

  const response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 1024 });
  const text = response.response?.trim() || "";

  // Extract confidence score
  const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/i);
  const confidence = confidenceMatch ? Math.min(100, Math.max(0, parseInt(confidenceMatch[1]))) : 70;
  const result = text.replace(/\n?CONFIDENCE:\s*\d+/i, "").trim();

  return { result, confidence };
}

/**
 * Synthesize final answer from all step results.
 */
async function synthesize(
  ai: any,
  task: string,
  steps: string[],
  results: Array<{ result: string; confidence: number }>,
): Promise<string> {
  const executionLog = steps
    .map((step, i) => `## Step ${i + 1}: ${step}\n${results[i].result}\n*(confidence: ${results[i].confidence}%)*)`)
    .join("\n\n");

  const avgConfidence = Math.round(
    results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
  );

  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Original task: ${task}\n\nExecution log:\n\n${executionLog}\n\nSynthesize a clear, concise final answer. Summarize the key findings, any caveats, and the overall confidence (${avgConfidence}%).`,
    },
  ];

  const response = await ai.run(DEFAULT_MODEL, { messages, max_tokens: 1024 });
  return response.response?.trim() || "No response generated.";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "POST required" }),
        { status: 405, headers: corsHeaders },
      );
    }

    let body: { task?: string; context?: string; stream?: boolean };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const task = body.task?.trim();
    if (!task) {
      return new Response(
        JSON.stringify({ error: "task field is required" }),
        { status: 400, headers: corsHeaders },
      );
    }

    try {
      // Step 1: Plan
      const steps = await planSteps(env.AI, task, body.context);

      // Step 2: Execute each step
      const results: Array<{ result: string; confidence: number }> = [];
      const priorResults: string[] = [];

      for (let i = 0; i < steps.length; i++) {
        const stepResult = await executeStep(
          env.AI,
          task,
          steps[i],
          i + 1,
          steps.length,
          priorResults,
        );
        results.push(stepResult);
        priorResults.push(stepResult.result);
      }

      // Step 3: Synthesize
      const finalAnswer = await synthesize(env.AI, task, steps, results);
      const avgConfidence = Math.round(
        results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
      );

      return new Response(
        JSON.stringify({
          task,
          steps: steps.map((step, i) => ({
            step,
            result: results[i].result,
            confidence: results[i].confidence,
          })),
          finalAnswer,
          overallConfidence: avgConfidence,
          model: DEFAULT_MODEL,
          worker: "kimi-agent",
        }, null, 2),
        { headers: corsHeaders },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: err.message || "Internal worker error",
          worker: "kimi-agent",
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  },
};
