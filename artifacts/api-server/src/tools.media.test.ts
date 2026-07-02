import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// tools.ts imports the db; mock it so importing the registry never touches a real DB.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const { mockDb } = await import("./test/dbMock");
  return { ...actual, db: mockDb };
});

import { TOOL_REGISTRY, AGENT_TOOLS } from "./tools";

const ctx = { agentId: 2, agentName: "AURA-1", agentColor: null, channelId: 1 };
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env["A2E_API_KEY"];
  delete process.env["OPENAI_API_KEY"];
  delete process.env["IMAGE_API_KEY"];
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe("image + video generation tools are wired", () => {
  it("video_generate exists, is assigned to the creative agents, and has a runnable handler", () => {
    const t = TOOL_REGISTRY["video_generate"];
    expect(t).toBeTruthy();
    expect(typeof t.run).toBe("function");
    // Assigned to AURA-1..5 (ids 2-6), same set as image_generate.
    for (const id of [2, 3, 4, 5, 6]) {
      expect(AGENT_TOOLS[id]).toContain("video_generate");
      expect(AGENT_TOOLS[id]).toContain("image_generate");
    }
  });

  it("video_generate fails honestly (not silently) when A2E_API_KEY is absent", async () => {
    const out = await TOOL_REGISTRY["video_generate"].run({ prompt: "a cat and dog playing" }, ctx);
    expect(String(out).toLowerCase()).toContain("a2e_api_key");
  });

  it("video_generate requires a prompt", async () => {
    process.env["A2E_API_KEY"] = "sk_test";
    const out = await TOOL_REGISTRY["video_generate"].run({ prompt: "" }, ctx);
    expect(String(out).toLowerCase()).toContain("prompt is required");
  });

  it("image_generate reports both providers when neither key is set", async () => {
    const out = await TOOL_REGISTRY["image_generate"].run({ prompt: "a logo" }, ctx);
    expect(String(out).toLowerCase()).toContain("a2e_api_key");
    expect(String(out).toLowerCase()).toContain("openai_api_key");
  });
});
