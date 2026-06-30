import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentsRouter from "./agents";
import channelsRouter from "./channels";
import tasksRouter from "./tasks";
import telemetryRouter from "./telemetry";
import swarmRouter from "./swarm";
import commandsRouter from "./commands";
import steelRouter from "./steel";
import aiRouter from "./ai";
import externalRouter from "./external";
import integrationsRouter from "./integrations";
import selfCheckRouter from "./selfCheck";
import authRouter from "./auth";
import vaultRouter from "./vault";
import socialRouter from "./social";
import uploadsRouter from "./uploads";
import worldRouter from "./world";
import discordRouter from "./discord";
import n8nRouter from "./n8n";
import mvpGovernorRouter from "./mvpGovernor";
import settingsRouter from "./settings";
import scratchpadRouter from "./scratchpad";
import agentScratchRouter from "./agentScratch";
import hermesRouter from "./hermes";
import openhandsRouter from "./openhands";
import crawl4aiRouter from "./crawl4ai";
import mem0Router from "./mem0";
import doclingRouter from "./docling";
import knowledgeRouter from "./knowledge";
import { devicesRouter } from "@workspace/remote-control/routes";
import { missionsRouter } from "./missions";
import referenceRouter from "./reference";
import { requireOperator } from "../lib/auth";

const router: IRouter = Router();

// Open: health checks (Render needs these reachable with no auth), the
// login/logout/me endpoints themselves, the external API (gated by its own
// AURA_OMEGA_API_KEY, not a browser session), and the world router (which
// manages its own selective public/operator split). n8nRouter gates itself
// internally so its inbound webhook receiver stays reachable. Everything
// else is the dashboard surface — gated so only the 3 signed-in users can
// reach it.
router.use(healthRouter);
router.use(authRouter);
router.use(externalRouter);
router.use(worldRouter);
router.use(n8nRouter);

router.use("/agents", requireOperator, agentsRouter);
router.use("/channels", requireOperator, channelsRouter);
router.use("/tasks", requireOperator, tasksRouter);
router.use(requireOperator, telemetryRouter);
router.use("/swarm", requireOperator, swarmRouter);
router.use(requireOperator, commandsRouter);
router.use(requireOperator, steelRouter);
router.use(requireOperator, aiRouter);
router.use("/discord", requireOperator, discordRouter);
router.use(requireOperator, mvpGovernorRouter);
router.use(requireOperator, settingsRouter);
router.use("/", requireOperator, scratchpadRouter);
router.use("/", requireOperator, agentScratchRouter);
router.use(requireOperator, uploadsRouter);
router.use(requireOperator, integrationsRouter);
router.use(requireOperator, selfCheckRouter);
router.use("/hermes", requireOperator, hermesRouter);
router.use("/openhands", requireOperator, openhandsRouter);
router.use("/crawl4ai", requireOperator, crawl4aiRouter);
router.use("/mem0", requireOperator, mem0Router);
router.use("/docling", requireOperator, doclingRouter);
router.use("/knowledge", requireOperator, knowledgeRouter);
router.use("/devices", requireOperator, devicesRouter);
router.use("/missions", requireOperator, missionsRouter);
router.use(requireOperator, referenceRouter);
router.use(requireOperator, vaultRouter);
router.use(requireOperator, socialRouter);

export default router;
