import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  checkToolPayloadBudget,
  ensureFinalAnswer,
  hasUnexpectedScript,
  installFinalAnswerCrashGuard,
  sanitizeFinalOutput,
  toolCallKey,
  verifyArtifactDelivery,
} from "./runtimeGuards";

describe("runtime orchestration guards", () => {
  it("canonicalizes tool-call arguments before hashing/deduping", () => {
    const a = toolCallKey("m1", "send_message", { b: 2, a: 1 });
    const b = toolCallKey("m1", "send_message", { a: 1, b: 2 });

    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(a).toBe(b);
  });

  it("fails oversized tool payloads before execution", () => {
    const result = checkToolPayloadBudget("code_exec", { source: "x".repeat(50) }, 20);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("above the 20 byte runtime limit");
    }
  });

  it("sanitizes known stream contamination fragments", () => {
    expect(sanitizeFinalOutput("  I'llQB   help  ")).toBe("I'll help");
    expect(hasUnexpectedScript("normal English output")).toBe(false);
    expect(hasUnexpectedScript("normal English 能将 contaminated")).toBe(true);
  });

  it("always produces a non-empty final answer", () => {
    expect(ensureFinalAnswer("", ["AURA-1 result"])).toBe("AURA-1 result");
    expect(ensureFinalAnswer(null, [])).toContain("UNVERIFIED");
  });

  it("separates artifact content readiness from delivery success", () => {
    expect(
      verifyArtifactDelivery({
        toolSucceeded: false,
        contentLength: 100,
        expectedType: "text/plain",
        actualType: "text/plain",
      }).status,
    ).toBe("CONTENT_READY_ARTIFACT_FAILED");

    expect(
      verifyArtifactDelivery({
        toolSucceeded: true,
        url: "https://example.test/report.txt",
        contentLength: 100,
        expectedType: "text/plain",
        actualType: "text/plain",
      }).status,
    ).toBe("COMPLETE");
  });

  it("installs a process-wide finalAnswer crash guard", () => {
    delete (globalThis as typeof globalThis & { finalAnswer?: string }).finalAnswer;

    installFinalAnswerCrashGuard();

    expect((globalThis as typeof globalThis & { finalAnswer?: string }).finalAnswer).toBe("");
  });
});
