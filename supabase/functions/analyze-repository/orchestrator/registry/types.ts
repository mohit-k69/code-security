import type { ReviewSpecification } from "../../prompts/specifications/ReviewSpecification.ts";
import type { EvalDataset } from "../../evals/types.ts";

export interface RegisteredCheckpoint {
  /** The unique ID of the checkpoint (e.g., "SEC-AUTH-001") */
  id: string;

  /** The human-readable name of the checkpoint (e.g., "Authentication Security Review") */
  name: string;

  /** The version of the checkpoint (e.g., "2.0") */
  version: string;

  /** The security category (e.g., "authentication", "supply-chain") */
  category: string;

  /** The review specification containing the prompt rules and criteria */
  spec: ReviewSpecification;

  /** The evaluation dataset containing the benchmark scenarios for this checkpoint */
  dataset: EvalDataset;

  /** Whether this checkpoint is currently enabled for execution */
  enabled: boolean;

  /**
   * Routing rules defining when this checkpoint should execute.
   * If undefined or empty, it runs on all PRs.
   * For v1, this is an array of glob patterns matching file paths.
   */
  routingRules?: string[];
}
