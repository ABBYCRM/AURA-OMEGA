import { Router } from "express";
import { defaultAuroOmegaMvpEvidence, reviewMvp, type MvpEvidenceInput } from "../lib/mvpGovernor";

const router = Router();

router.get("/mvp-governor", (_req, res) => {
  const evidence = defaultAuroOmegaMvpEvidence();
  res.json({ evidence, review: reviewMvp(evidence) });
});

router.post("/mvp-governor/review", (req, res) => {
  const evidence = { ...defaultAuroOmegaMvpEvidence(), ...(req.body ?? {}) } as MvpEvidenceInput;
  res.json({ evidence, review: reviewMvp(evidence) });
});

export default router;
