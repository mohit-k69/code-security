import { VulnerabilityClass } from "../types/VulnerabilityClass.ts";
import type { Location, CheckpointEvidence } from "../../services/CheckpointRunner.ts";

export interface AggregatedFinding {
  /** The deterministic hash grouping these findings */
  findingId: string;
  
  /** The standardized taxonomy class (e.g., "XSS") */
  vulnerabilityClass: VulnerabilityClass;
  
  /** The root cause location */
  primaryLocation: Location;
  
  /** The highest severity reported by any contributing checkpoint */
  severity: "critical" | "warning" | "info";
  
  /** The highest confidence reported by any contributing checkpoint */
  confidence: number;
  
  /** All unique CWEs reported */
  cwes: string[];
  
  /** The canonical description (drawn from the highest-confidence finding) */
  description: string;
  
  /** The canonical actionable fix (drawn from the highest-confidence finding) */
  suggestion: string;
  
  /** The union of all deduplicated evidence traces */
  evidence: CheckpointEvidence[];
  
  /** 
   * Lineage: Which checkpoints contributed to this merged finding?
   * e.g., ["SEC-AUTH-001", "SEC-CONFIG-001"]
   */
  contributingCheckpoints: string[];
}
