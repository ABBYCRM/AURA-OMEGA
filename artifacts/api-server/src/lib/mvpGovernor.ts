export type MvpStatus = "PASS" | "PARTIAL" | "FAIL" | "BLOCKED";

export interface MvpEvidenceInput {
  buildVerified?: boolean;
  testsVerified?: boolean;
  playwrightVerified?: boolean;
  deployVerified?: boolean;
  n8nVerified?: boolean;
  githubPushVerified?: boolean;
  userFlowVerified?: boolean;
  uiComplete?: boolean;
  toolMatrixVerified?: boolean;
  heartbeatVerified?: boolean;
  secretsVerified?: boolean;
  uploadVerified?: boolean;
  searchAvailable?: boolean;
  notes?: string[];
}

export interface MvpGovernorReview {
  status: MvpStatus;
  score: number;
  law: "NO_TASK_IS_COMPLETE_UNTIL_MVP_GOVERNOR_PASSES_IT";
  requiredQuestion: "Does this qualify as an MVP?";
  blockers: string[];
  missingFeatures: string[];
  brokenFlows: string[];
  deploymentGaps: string[];
  uxGaps: string[];
  safetyGaps: string[];
  nextActions: string[];
  improvementLoop: string[];
  releaseAllowed: boolean;
}

function yes(v: unknown): boolean { return v === true; }
function addIf(arr: string[], condition: boolean, message: string): void { if (condition) arr.push(message); }

export function reviewMvp(input: MvpEvidenceInput): MvpGovernorReview {
  const blockers: string[] = [];
  const missingFeatures: string[] = [];
  const brokenFlows: string[] = [];
  const deploymentGaps: string[] = [];
  const uxGaps: string[] = [];
  const safetyGaps: string[] = [];

  addIf(blockers, !yes(input.buildVerified), "Actual build is not verified.");
  addIf(blockers, !yes(input.testsVerified), "Automated tests are not verified.");
  addIf(blockers, !yes(input.userFlowVerified), "Critical user flow is not verified.");
  addIf(deploymentGaps, !yes(input.deployVerified), "Deployment and health endpoint are not verified.");
  addIf(deploymentGaps, !yes(input.githubPushVerified), "Full source push/PR/rollback path is not verified.");
  addIf(brokenFlows, !yes(input.n8nVerified), "Live n8n webhook execution/result verification is not verified.");
  addIf(brokenFlows, !yes(input.playwrightVerified), "Playwright UI smoke proof is not verified.");
  addIf(missingFeatures, !yes(input.toolMatrixVerified), "Tool Selection Matrix scoring/selection is not verified.");
  addIf(missingFeatures, !yes(input.heartbeatVerified), "Heartbeat/autonomy loop is not verified.");
  addIf(uxGaps, !yes(input.uiComplete), "UI/UX console is not complete or not verified.");
  addIf(uxGaps, !yes(input.uploadVerified), "Upload flow is not verified for configured file cap.");
  addIf(safetyGaps, !yes(input.secretsVerified), "Secrets/integrations write-only behavior is not verified.");
  addIf(blockers, input.searchAvailable === false, "MVP review blocked from external improvement search because no search provider is available.");

  const checks = [input.buildVerified, input.testsVerified, input.playwrightVerified, input.deployVerified, input.n8nVerified, input.githubPushVerified, input.userFlowVerified, input.uiComplete, input.toolMatrixVerified, input.heartbeatVerified, input.secretsVerified, input.uploadVerified];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  let status: MvpStatus = "PASS";
  if (blockers.length || brokenFlows.length || deploymentGaps.length) status = "FAIL";
  else if (missingFeatures.length || uxGaps.length || safetyGaps.length) status = "PARTIAL";
  if (input.searchAvailable === false && status !== "PASS") status = "BLOCKED";

  const nextActions = [...blockers, ...brokenFlows, ...deploymentGaps, ...missingFeatures, ...uxGaps, ...safetyGaps]
    .map((gap) => `Fix and verify: ${gap}`);

  return {
    status,
    score,
    law: "NO_TASK_IS_COMPLETE_UNTIL_MVP_GOVERNOR_PASSES_IT",
    requiredQuestion: "Does this qualify as an MVP?",
    blockers,
    missingFeatures,
    brokenFlows,
    deploymentGaps,
    uxGaps,
    safetyGaps,
    nextActions,
    improvementLoop: [
      "Find gap",
      "Search memory",
      "Search documentation",
      "Search tool registry",
      "Search connected repositories",
      "Search available approved search providers",
      "Generate fix",
      "Implement fix",
      "Verify fix",
      "Repeat until MVP Governor status is PASS or a true blocker is recorded",
    ],
    releaseAllowed: status === "PASS",
  };
}

export function defaultAuroOmegaMvpEvidence(): MvpEvidenceInput {
  return {
    buildVerified: false,
    testsVerified: false,
    playwrightVerified: false,
    deployVerified: false,
    n8nVerified: false,
    githubPushVerified: false,
    userFlowVerified: false,
    uiComplete: true,
    toolMatrixVerified: true,
    heartbeatVerified: true,
    secretsVerified: false,
    uploadVerified: false,
    searchAvailable: Boolean(process.env["TAVILY_API_KEY"] || process.env["EXA_API_KEY"] || process.env["SEARXNG_URL"]),
    notes: ["Default evidence is conservative. Runtime must set true only after observed verification."],
  };
}
