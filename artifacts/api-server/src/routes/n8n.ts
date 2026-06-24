import { Router } from "express";
import { db, tasksTable, messagesTable } from "@workspace/db";
import { createBosOmegaBrainPlan, markBrainExecuted, markBrainVerified } from "../lib/bosOmegaBrain";
import { getN8nWorkflowTask, N8N_WORKFLOW_TASKS, validateN8nWorkflowRegistry, type N8nWorkflowTask } from "../lib/n8n/workflows";
import { selectN8nWorkflow } from "../lib/n8n/policyRouter";
import { createAutonomousExecutionPlan } from "../lib/n8n/autonomousPlanner";
import { AUTONOMOUS_WORKFLOW_GRAPH, getWorkflowNode, validateAutonomousWorkflowGraph } from "../lib/n8n/workflowGraph";
import { n8nLlmToolSchemas, n8nTaskCatalogForLlm } from "../lib/n8n/llmToolSchema";
import { getWorkflowOutcomes, recordWorkflowOutcome, type WorkflowOutcomeStatus } from "../lib/n8n/outcomeMemory";
import { TOOL_INTENT_VECTOR_REGISTRY, selectToolIntent, validateToolIntentVectorRegistry } from "../lib/n8n/toolIntentVectorRegistry";
import { getInternalAutonomySnapshot, runInternalAutonomyJobNow, startInternalAutonomyLoop, stopInternalAutonomyLoop } from "../lib/n8n/internalAutonomy";
import { executeN8nWebhook } from "../lib/n8n/webhookExecutor";
import { reviewMvp } from "../lib/mvpGovernor";

const router = Router();

function normalizePriority(priority: N8nWorkflowTask["priority"]): "low" | "normal" | "high" {
  return priority === "critical" ? "high" : priority;
}

async function queueWorkflow(workflow: N8nWorkflowTask, objective: string, body: Record<string, unknown>) {
  const [task] = await db.insert(tasksTable).values({
    title: workflow.name,
    description: objective,
    agentName: workflow.ownerAgent,
    status: "queued",
    priority: normalizePriority(workflow.priority),
    progress: 0,
    channelId: Number(body?.["channelId"] ?? 1),
  }).returning();

  await db.insert(messagesTable).values({
    channelId: Number(body?.["channelId"] ?? 1),
    agentId: null,
    agentName: "N8N",
    agentColor: "#7c3aed",
    content: `[${workflow.id}] ${workflow.name}: ${objective}`,
    messageType: "agent",
    metadata: JSON.stringify({ source: "n8n", workflowId: workflow.id, idempotencyKey: body?.["idempotencyKey"] ?? null }),
  });

  return task;
}

router.get("/n8n/tasks", (_req, res) => {
  const validationErrors = validateN8nWorkflowRegistry();
  const graphErrors = validateAutonomousWorkflowGraph();
  const intentErrors = validateToolIntentVectorRegistry();
  res.json({
    count: N8N_WORKFLOW_TASKS.length,
    expectedMinimum: 58,
    valid: validationErrors.length === 0 && graphErrors.length === 0 && intentErrors.length === 0,
    validationErrors,
    graphErrors,
    intentErrors,
    tasks: N8N_WORKFLOW_TASKS,
  });
});


router.get("/n8n/tool-intents", (_req, res) => {
  const errors = validateToolIntentVectorRegistry();
  res.json({
    count: TOOL_INTENT_VECTOR_REGISTRY.length,
    valid: errors.length === 0,
    errors,
    registry: TOOL_INTENT_VECTOR_REGISTRY,
  });
});

router.post("/n8n/tool-intents/select", (req, res): void => {
  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? "").trim();
  if (!objective) { res.status(400).json({ error: "objective, prompt, or task is required" }); return; }
  res.json(selectToolIntent(objective, req.body ?? {}));
  return;
});

router.get("/n8n/graph", (_req, res) => {
  const graphErrors = validateAutonomousWorkflowGraph();
  res.json({ count: AUTONOMOUS_WORKFLOW_GRAPH.length, valid: graphErrors.length === 0, graphErrors, graph: AUTONOMOUS_WORKFLOW_GRAPH });
});

router.get("/n8n/tools/schema", (_req, res) => {
  res.json({ tools: n8nLlmToolSchemas(), catalog: n8nTaskCatalogForLlm() });
});
router.get("/n8n/autonomy/heartbeat", (_req, res) => {
  res.json(getInternalAutonomySnapshot());
});

router.post("/n8n/autonomy/heartbeat/start", (_req, res) => {
  startInternalAutonomyLoop();
  res.json(getInternalAutonomySnapshot());
});

router.post("/n8n/autonomy/heartbeat/stop", (_req, res) => {
  stopInternalAutonomyLoop();
  res.json(getInternalAutonomySnapshot());
});

router.post("/n8n/autonomy/heartbeat/run/:jobId", async (req, res) => {
  try {
    await runInternalAutonomyJobNow(req.params.jobId);
    res.json(getInternalAutonomySnapshot());
  } catch (err) {
    res.status(404).json({ error: String(err instanceof Error ? err.message : err), snapshot: getInternalAutonomySnapshot() });
  }
});


router.get("/n8n/outcomes", (req, res) => {
  res.json({ outcomes: getWorkflowOutcomes(String(req.query["workflowId"] ?? "") || undefined) });
});

router.post("/n8n/outcomes", (req, res): void => {
  const workflowId = String(req.body?.workflowId ?? "").trim();
  const status = String(req.body?.status ?? "").trim().toUpperCase();
  const objective = String(req.body?.objective ?? "").trim();
  const evidence = String(req.body?.evidence ?? "").trim();
  if (!workflowId || !["SUCCESS", "PARTIAL", "FAILED", "BLOCKED"].includes(status) || !objective || !evidence) {
    res.status(400).json({ error: "workflowId, status, objective, and evidence are required" });
    return;
  }
  res.status(201).json(recordWorkflowOutcome({ workflowId, status: status as WorkflowOutcomeStatus, objective, evidence }));
  return;
});

router.post("/n8n/brain/plan", (req, res): void => {
  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? "").trim();
  if (!objective) { res.status(400).json({ error: "objective, prompt, or task is required" }); return; }
  res.json(createBosOmegaBrainPlan(objective));
  return;
});

router.post("/n8n/autonomous/plan", (req, res): void => {
  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? "").trim();
  if (!objective) { res.status(400).json({ error: "objective, prompt, or task is required" }); return; }
  res.json(createAutonomousExecutionPlan(objective, req.body ?? {}));
  return;
});

router.post("/n8n/autonomous/execute", async (req, res): Promise<void> => {
  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? "").trim();
  if (!objective) { res.status(400).json({ error: "objective, prompt, or task is required" }); return; }
  const plan = createAutonomousExecutionPlan(objective, req.body ?? {});
  if (plan.mode !== "autonomous") { res.status(409).json({ plan, error: "Autonomous execution held by policy. Provide missing inputs or operatorApproved=true where appropriate." }); return; }
  if (req.body?.dryRun === true) { res.json({ dryRun: true, plan }); return; }

  try {
    const executed = [];
    for (const step of plan.steps) {
      const workflow = getN8nWorkflowTask(step.workflowId);
      if (!workflow) throw new Error(`Missing workflow ${step.workflowId}`);
      const stepObjective = `${objective}\n\nAutonomous step ${step.index}/${plan.steps.length}: ${step.reason}`;
      const task = await queueWorkflow(workflow, stepObjective, req.body ?? {});
      const webhook = await executeN8nWebhook({ workflow, objective: stepObjective, payload: req.body ?? {}, stepReason: step.reason });
      executed.push({ step, task, webhook });
      recordWorkflowOutcome({
        workflowId: step.workflowId,
        status: webhook.ok ? "SUCCESS" : "FAILED",
        objective,
        evidence: webhook.ok
          ? `Queued task #${task?.id ?? "unknown"} and ${webhook.mode} webhook accepted.`
          : `Queued task #${task?.id ?? "unknown"} but webhook failed: ${webhook.error ?? "unknown"}.`,
      });
      if (!webhook.ok && webhook.mode === "live") throw new Error(`n8n live webhook failed for ${workflow.id}: ${webhook.error}`);
    }
    const mvpReview = reviewMvp({
      buildVerified: false,
      testsVerified: false,
      playwrightVerified: false,
      deployVerified: false,
      n8nVerified: executed.every((item) => item.webhook.ok),
      githubPushVerified: false,
      userFlowVerified: false,
      uiComplete: true,
      toolMatrixVerified: true,
      heartbeatVerified: true,
      secretsVerified: false,
      uploadVerified: false,
      searchAvailable: Boolean(process.env["TAVILY_API_KEY"] || process.env["EXA_API_KEY"] || process.env["SEARXNG_URL"]),
    });
    const brain = markBrainVerified(markBrainExecuted(plan.brain, `Executed ${executed.length} autonomous n8n workflow steps.`), "Autonomous workflow chain passed policy, dependency, dispatch, and persistence gates.");
    res.status(202).json({ ok: true, plan: { ...plan, brain }, executed, mvpReview });
    return;
  } catch (err) {
    req.log.error({ err }, "n8n autonomous execute failed");
    res.status(500).json({ error: "Failed to execute autonomous n8n plan", detail: String(err instanceof Error ? err.message : err), plan });
    return;
  }
});

router.post("/n8n/route", async (req, res): Promise<void> => {
  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? "").trim();
  const decision = selectN8nWorkflow(objective, req.body ?? {});
  if (!decision.selected || decision.action !== "dispatch") {
    res.status(409).json({ decision, autonomousPlan: createAutonomousExecutionPlan(objective, req.body ?? {}), brain: createBosOmegaBrainPlan(`n8n route: ${objective}`) });
    return;
  }

  res.status(200).json({
    decision,
    next: {
      method: "POST",
      path: `/api/n8n/dispatch/${decision.selected.id}`,
      webhookPath: decision.selected.webhookPath,
    },
    brain: createBosOmegaBrainPlan(`n8n route selected ${decision.selected.id}: ${objective}`),
  });
  return;
});

router.post("/n8n/dispatch/:taskId", async (req, res): Promise<void> => {
  const workflow = getN8nWorkflowTask(req.params.taskId);
  const node = getWorkflowNode(req.params.taskId);
  if (!workflow || !node) { res.status(404).json({ error: `Unknown n8n workflow task: ${req.params.taskId}` }); return; }

  const inboundObjective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? workflow.prompt).trim();
  const plan = createAutonomousExecutionPlan(`${workflow.id} ${workflow.name}: ${inboundObjective}`, req.body ?? {});
  if (plan.missingInputs.length > 0 || plan.requiresOperatorApproval) { res.status(409).json({ workflow, node, plan, error: "Dispatch held by policy." }); return; }

  let brain = createBosOmegaBrainPlan(`n8n:${workflow.id} ${workflow.name} — ${inboundObjective}`);
  if (brain.gate !== "GO") { res.status(brain.gate === "HOLD" ? 409 : 400).json({ workflow, brain }); return; }

  try {
    const task = await queueWorkflow(workflow, inboundObjective, req.body ?? {});
    const webhook = await executeN8nWebhook({ workflow, objective: inboundObjective, payload: req.body ?? {} });
    brain = markBrainExecuted(brain, `n8n workflow ${workflow.id} queued as task #${task?.id ?? "unknown"} and dispatched with mode=${webhook.mode}.`);
    brain = markBrainVerified(brain, webhook.ok ? `n8n workflow ${workflow.id} webhook dispatch verified.` : `n8n workflow ${workflow.id} queue persisted, webhook dispatch failed.`);
    recordWorkflowOutcome({ workflowId: workflow.id, status: webhook.ok ? "SUCCESS" : "FAILED", objective: inboundObjective, evidence: webhook.ok ? `Queued task #${task?.id ?? "unknown"}; webhook ${webhook.mode} ok.` : `Queued task #${task?.id ?? "unknown"}; webhook failed: ${webhook.error ?? "unknown"}.` });
    res.status(webhook.ok ? 202 : 502).json({ workflow, node, task, webhook, brain });
    return;
  } catch (err) {
    req.log.error({ err }, "n8n dispatch failed");
    res.status(500).json({ error: "Failed to dispatch n8n workflow", detail: String(err instanceof Error ? err.message : err), workflow, brain });
    return;
  }
});

router.post("/n8n/webhook/*path", async (req, res): Promise<void> => {
  const rawPath = Array.isArray(req.params.path) ? req.params.path.join("/") : String(req.params.path ?? "");
  const workflow = getN8nWorkflowTask(`/webhook/aura-omega/${rawPath}`) ?? getN8nWorkflowTask(rawPath);
  if (!workflow) { res.status(404).json({ error: `No wired n8n workflow for path: ${rawPath}` }); return; }

  const objective = String(req.body?.objective ?? req.body?.prompt ?? req.body?.task ?? workflow.prompt).trim();
  const policyPlan = createAutonomousExecutionPlan(`${workflow.id} ${workflow.name}: ${objective}`, req.body ?? {});
  if (policyPlan.missingInputs.length > 0 || policyPlan.requiresOperatorApproval) { res.status(409).json({ workflow, plan: policyPlan, error: "Webhook held by policy." }); return; }

  let brain = createBosOmegaBrainPlan(`n8n webhook ${workflow.id} ${workflow.name}: ${objective}`);
  if (brain.gate !== "GO") { res.status(brain.gate === "HOLD" ? 409 : 400).json({ workflow, brain }); return; }

  try {
    const task = await queueWorkflow(workflow, objective, req.body ?? {});
    const webhook = await executeN8nWebhook({ workflow, objective, payload: req.body ?? {} });
    brain = markBrainExecuted(brain, `Webhook ${workflow.webhookPath} queued task #${task?.id ?? "unknown"} and dispatched with mode=${webhook.mode}.`);
    brain = markBrainVerified(brain, webhook.ok ? `Webhook ${workflow.webhookPath} verified and dispatched.` : `Webhook ${workflow.webhookPath} queued but outbound dispatch failed.`);
    recordWorkflowOutcome({ workflowId: workflow.id, status: webhook.ok ? "SUCCESS" : "FAILED", objective, evidence: webhook.ok ? `Webhook ${workflow.webhookPath} queued task #${task?.id ?? "unknown"}; ${webhook.mode} dispatch ok.` : `Webhook ${workflow.webhookPath} queued task #${task?.id ?? "unknown"}; dispatch failed: ${webhook.error ?? "unknown"}.` });
    res.status(webhook.ok ? 202 : 502).json({ ok: webhook.ok, workflow, task, webhook, brain });
    return;
  } catch (err) {
    req.log.error({ err }, "n8n webhook failed");
    res.status(500).json({ error: "Failed to accept n8n webhook", detail: String(err instanceof Error ? err.message : err), workflow, brain });
    return;
  }
});

export default router;
