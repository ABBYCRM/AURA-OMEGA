export type WorkflowOutcomeStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "BLOCKED";

export interface WorkflowOutcome {
  workflowId: string;
  status: WorkflowOutcomeStatus;
  objective: string;
  evidence: string;
  timestamp: string;
  latencyMs?: number;
}

const ledger: WorkflowOutcome[] = [];

export function recordWorkflowOutcome(outcome: Omit<WorkflowOutcome, "timestamp"> & { timestamp?: string }): WorkflowOutcome {
  const saved: WorkflowOutcome = { ...outcome, timestamp: outcome.timestamp ?? new Date().toISOString() };
  ledger.push(saved);
  if (ledger.length > 500) ledger.splice(0, ledger.length - 500);
  return saved;
}

export function getWorkflowOutcomes(workflowId?: string): WorkflowOutcome[] {
  return workflowId ? ledger.filter((x) => x.workflowId === workflowId) : [...ledger];
}

export function workflowSuccessScore(workflowId: string): number {
  const recent = getWorkflowOutcomes(workflowId).slice(-20);
  if (!recent.length) return 0.5;
  const points = recent.reduce((sum, item) => {
    if (item.status === "SUCCESS") return sum + 1;
    if (item.status === "PARTIAL") return sum + 0.5;
    if (item.status === "BLOCKED") return sum + 0.25;
    return sum;
  }, 0);
  return Math.max(0, Math.min(1, points / recent.length));
}

export function clearWorkflowOutcomes(): void {
  ledger.splice(0, ledger.length);
}
