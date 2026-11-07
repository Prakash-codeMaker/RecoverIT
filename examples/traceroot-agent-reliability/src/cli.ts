import { TraceRoot } from "@traceroot-ai/traceroot";
import { runSyntheticCase, type WorkflowDependencies } from "./workflow.js";

const apiKey = process.env.TRACEROOT_API_KEY;

if (apiKey) {
  TraceRoot.initialize({
    apiKey,
    environment: "demo",
    gitRepo: "Prakash-codeMaker/RecoverIT",
    instrumentModules: {},
    globalAttributes: {
      "app.name": "RecoverIT",
      "app.component": "agent-reliability-demo",
      "app.execution_mode": "synthetic",
    },
  });
} else {
  console.warn(
    "TRACEROOT_API_KEY is not set; the synthetic workflow will run without exporting traces.",
  );
}

let investigationAttempts = 0;

const dependencies: WorkflowDependencies = {
  verifyEvidence: async () => ({ verified: true, confidence: 98 }),
  investigate: async () => {
    investigationAttempts += 1;

    // Simulate a transient model/provider failure on the first attempt.
    if (investigationAttempts === 1) {
      throw new Error("Synthetic transient provider timeout");
    }

    return {
      route: "official_portal",
      nextAction: "RAISE_DISPUTE",
    };
  },
  dispatch: async () => ({
    accepted: true,
    reference: "SYNTHETIC-ACK-001",
  }),
};

try {
  const result = await runSyntheticCase(
    {
      caseId: "demo-case-001",
      amount: 500,
      currency: "INR",
      approved: true,
    },
    dependencies,
  );

  console.log(JSON.stringify({ scenario: "synthetic-approved-case", result }, null, 2));
} finally {
  if (apiKey) {
    await TraceRoot.flush();
    await TraceRoot.shutdown();
  }
}
