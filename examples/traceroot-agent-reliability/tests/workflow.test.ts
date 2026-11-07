import assert from "node:assert/strict";
import test from "node:test";
import { runSyntheticCase, type WorkflowDependencies } from "../src/workflow.js";

function caseInput(approved: boolean) {
  return {
    caseId: "test-case-001",
    amount: 500,
    currency: "INR" as const,
    approved,
  };
}

test("does not dispatch an external action before explicit user approval", async () => {
  let dispatchCalls = 0;
  let attempts = 0;

  const dependencies: WorkflowDependencies = {
    verifyEvidence: async () => ({ verified: true, confidence: 98 }),
    investigate: async () => {
      attempts += 1;
      return { route: "official_portal", nextAction: "RAISE_DISPUTE" };
    },
    dispatch: async () => {
      dispatchCalls += 1;
      return { accepted: true, reference: "SYNTHETIC-ACK-001" };
    },
  };

  const result = await runSyntheticCase(caseInput(false), dependencies);

  assert.equal(result.status, "WAITING_FOR_APPROVAL");
  assert.equal(dispatchCalls, 0);
  assert.equal(attempts, 1);
});

test("retries a transient investigation failure and dispatches only after approval", async () => {
  let dispatchCalls = 0;
  let attempts = 0;

  const dependencies: WorkflowDependencies = {
    verifyEvidence: async () => ({ verified: true, confidence: 98 }),
    investigate: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Synthetic provider timeout");
      return { route: "official_portal", nextAction: "RAISE_DISPUTE" };
    },
    dispatch: async () => {
      dispatchCalls += 1;
      return { accepted: true, reference: "SYNTHETIC-ACK-002" };
    },
  };

  const result = await runSyntheticCase(caseInput(true), dependencies);

  assert.equal(result.status, "SENT");
  assert.equal(attempts, 2);
  assert.equal(dispatchCalls, 1);
  if (result.status === "SENT") {
    assert.equal(result.reference, "SYNTHETIC-ACK-002");
  }
});

test("a failed evidence gate stops the workflow before investigation or dispatch", async () => {
  let investigationCalls = 0;
  let dispatchCalls = 0;

  const dependencies: WorkflowDependencies = {
    verifyEvidence: async () => ({ verified: false, confidence: 42 }),
    investigate: async () => {
      investigationCalls += 1;
      return { route: "official_portal", nextAction: "RAISE_DISPUTE" };
    },
    dispatch: async () => {
      dispatchCalls += 1;
      return { accepted: true, reference: "SHOULD-NOT-HAPPEN" };
    },
  };

  const result = await runSyntheticCase(caseInput(true), dependencies);

  assert.equal(result.status, "BLOCKED_EVIDENCE");
  assert.equal(investigationCalls, 0);
  assert.equal(dispatchCalls, 0);
});
