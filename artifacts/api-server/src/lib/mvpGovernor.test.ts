import { describe, expect, it } from "vitest";
import { reviewMvp } from "./mvpGovernor";

describe("MVP Governor", () => {
  it("does not pass without verified build/test/deploy/user flow evidence", () => {
    const review = reviewMvp({ uiComplete: true, toolMatrixVerified: true, heartbeatVerified: true, searchAvailable: true });
    expect(review.status).not.toBe("PASS");
    expect(review.releaseAllowed).toBe(false);
    expect(review.blockers.length).toBeGreaterThan(0);
  });

  it("passes only when every release gate is verified", () => {
    const review = reviewMvp({
      buildVerified: true,
      testsVerified: true,
      playwrightVerified: true,
      deployVerified: true,
      n8nVerified: true,
      githubPushVerified: true,
      userFlowVerified: true,
      uiComplete: true,
      toolMatrixVerified: true,
      heartbeatVerified: true,
      secretsVerified: true,
      uploadVerified: true,
      searchAvailable: true,
    });
    expect(review.status).toBe("PASS");
    expect(review.releaseAllowed).toBe(true);
  });
});
