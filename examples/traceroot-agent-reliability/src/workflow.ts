import { observe, updateCurrentSpan } from "@traceroot-ai/traceroot";

export interface SyntheticCase {
  /** A fixture identifier only. Never pass a real customer or payment ID. */
  caseId: string;
  amount: number;
  currency: "INR" | "USD";
  approved: boolean;
}

export interface EvidenceResult {
  verified: boolean;
  confidence: number;
}

export interface InvestigationResult {
  route: "official_portal" | "email";
  nextAction: "REQUEST_REFUND" | "RAISE_DISPUTE";
}

export interface DispatchResult {
  accepted: boolean;
  reference: string;
}

export interface WorkflowDependencies {
  verifyEvidence: (input: SyntheticCase) => Promise<EvidenceResult>;
  investigate: (attempt: number) => Promise<InvestigationResult>;
  /** This is a local fixture. It must never call a real payment/provider API. */
  dispatch: (plan: InvestigationResult) => Promise<DispatchResult>;
}

export type WorkflowResult =
  | { status: "BLOCKED_EVIDENCE"; confidence: number }
  | { status: "WAITING_FOR_APPROVAL"; route: InvestigationResult["route"]; attempts: number }
  | { status: "SENT"; route: InvestigationResult["route"]; attempts: number; reference: string };

function annotate(step: string, status: string): void {
  updateCurrentSpan({
    attributes: {
      "recoverit.workflow.step": step,
      "recoverit.workflow.status": status,
    },
  });
}

async function investigateWithRetry(
  investigate: WorkflowDependencies["investigate"],
  maxAttempts: number,
): Promise<{ plan: InvestigationResult; attempts: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const plan = await observe(
        {
          name: "recoverit.ai.investigate",
          type: "llm",
          captureInput: false,
          captureOutput: false,
          metadata: {
            provider: "synthetic-fixture",
            attempt,
            max_attempts: maxAttempts,
          },
        },
        () => investigate(attempt),
      );

      updateCurrentSpan({
        attributes: {
          "recoverit.ai.attempts": attempt,
          "recoverit.ai.result": "success",
        },
      });

      return { plan, attempts: attempt };
    } catch (error) {
      lastError = error;
      updateCurrentSpan({
        attributes: {
          "recoverit.ai.attempts": attempt,
          "recoverit.ai.last_error": error instanceof Error ? error.name : "UnknownError",
        },
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Investigation failed after retries.");
}

/**
 * Runs a synthetic recovery case to demonstrate nested traces, retry visibility,
 * evidence gates, and explicit approval before an external action.
 *
 * The function is deliberately dependency-injected: this example never sends
 * a real email, SMS, dispute, refund, or payment-provider request.
 */
export async function runSyntheticCase(
  input: SyntheticCase,
  dependencies: WorkflowDependencies,
): Promise<WorkflowResult> {
  return observe<[], WorkflowResult>(
    {
      name: "recoverit.case.workflow",
      type: "agent",
      captureInput: false,
      captureOutput: false,
      sessionId: `demo-session:${input.caseId}`,
      userId: "synthetic-demo-user",
      metadata: {
        case_id: input.caseId,
        scenario: "payment-recovery",
        execution_mode: "synthetic",
      },
    },
    async (): Promise<WorkflowResult> => {
      updateCurrentSpan({
        attributes: {
          "recoverit.case.id": input.caseId,
          "recoverit.case.currency": input.currency,
          "recoverit.case.amount": input.amount,
          "recoverit.workflow.step": "evidence",
        },
      });

      const evidence = await observe(
        {
          name: "recoverit.evidence.verify",
          type: "tool",
          captureInput: false,
          captureOutput: false,
        },
        () => dependencies.verifyEvidence(input),
      );

      updateCurrentSpan({
        attributes: {
          "recoverit.evidence.verified": evidence.verified,
          "recoverit.evidence.confidence": evidence.confidence,
        },
      });

      if (!evidence.verified) {
        annotate("evidence", "blocked");
        return { status: "BLOCKED_EVIDENCE", confidence: evidence.confidence };
      }

      annotate("investigation", "running");
      const { plan, attempts } = await investigateWithRetry(dependencies.investigate, 2);

      await observe(
        {
          name: "recoverit.route.prepare",
          type: "task",
          captureInput: false,
          captureOutput: false,
          metadata: { route: plan.route, next_action: plan.nextAction },
        },
        async () => {
          updateCurrentSpan({
            attributes: {
              "recoverit.route.selected": plan.route,
              "recoverit.route.next_action": plan.nextAction,
            },
          });
        },
      );

      if (!input.approved) {
        annotate("approval", "waiting_for_user");
        return {
          status: "WAITING_FOR_APPROVAL",
          route: plan.route,
          attempts,
        };
      }

      annotate("external_action", "approved");
      const dispatch = await observe(
        {
          name: "recoverit.external_action.dispatch",
          type: "tool",
          captureInput: false,
          captureOutput: false,
          metadata: {
            route: plan.route,
            approval_required: true,
            approval_granted: true,
            execution_mode: "synthetic",
          },
        },
        () => dependencies.dispatch(plan),
      );

      updateCurrentSpan({
        attributes: {
          "recoverit.external_action.accepted": dispatch.accepted,
          "recoverit.external_action.reference": dispatch.reference,
        },
      });

      annotate("external_action", dispatch.accepted ? "accepted" : "failed");

      if (!dispatch.accepted) {
        throw new Error("Synthetic provider did not accept the action.");
      }

      return {
        status: "SENT",
        route: plan.route,
        attempts,
        reference: dispatch.reference,
      };
    },
  );
}
