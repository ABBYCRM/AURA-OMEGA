import { describe, it, expect } from "vitest";
import { PC_AGENT_VERSION, PC_AGENT_DEFAULT_PORT, spawnAdapter } from "./index";

describe("pc-agent scaffold", () => {
  it("exports the expected version", () => {
    expect(PC_AGENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("exports the default port", () => {
    expect(PC_AGENT_DEFAULT_PORT).toBe(8787);
  });
  it("spawnAdapter throws not-implemented until Round B", async () => {
    await expect(spawnAdapter("rustdesk", ["--version"])).rejects.toThrow(
      /not implemented yet/,
    );
  });
});