import { CheckpointRunner } from "../services/CheckpointRunner.ts";
import type { ReviewSpecification, CheckpointResult } from "../services/CheckpointRunner.ts";
import type { SanitizedContextPackage } from "../services/types.ts";
import type { EvalDataset, EvalReport, ScenarioResult, ExpectedFinding } from "./types.ts";
import type { ILLMProvider } from "../orchestrator/providers/ILLMProvider.ts";

export class EvalRunner {
  private checkpointRunner: CheckpointRunner;

  constructor(provider: ILLMProvider) {
    this.checkpointRunner = new CheckpointRunner(provider);
  }

  public async runEvaluation(
    dataset: EvalDataset,
    frameworkPrompt: string,
    specification: ReviewSpecification
  ): Promise<EvalReport> {
    const startTime = performance.now();
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of dataset.scenarios) {
      console.log(`[Eval] Running scenario: ${scenario.id}...`);

      const sanitizedPackage: SanitizedContextPackage = {
        repository: "eval-repo",
        prNumber: 1,
        commitSha: "eval-commit",
        changedFiles: scenario.changedFiles.map(f => ({
          path: f.path,
          content: f.content,
          deleted: f.deleted ?? false,
        })),
        dependencies: scenario.dependencies ? scenario.dependencies.map(d => ({
          path: d.path,
          content: d.content,
        })) : [],
        metadata: {
          totalSecretsReplaced: 0,
          replacementTypes: {},
          ignoredReplacements: 0,
          processingTimeMs: 0,
        },
      };

      try {
        const actualResult = await this.checkpointRunner.run(
          sanitizedPackage,
          frameworkPrompt,
          specification
        );

        const scoredScenario = this.scoreScenario(scenario, actualResult);
        scenarioResults.push(scoredScenario);
      } catch (err: any) {
        scenarioResults.push({
          scenarioId: scenario.id,
          expectedVerdict: scenario.expectedVerdict,
          actualVerdict: "ERROR",
          verdictMatch: false,
          expectedFindingsCount: scenario.expectedFindings?.length || 0,
          actualFindingsCount: 0,
          falsePositives: 0,
          falseNegatives: scenario.expectedFindings?.length || 0,
          groundingScore: 0,
          executionTimeMs: 0,
          success: false,
          error: err.message,
        });
      }
    }

    return this.aggregateReport(dataset, scenarioResults, startTime);
  }

  private scoreScenario(scenario: any, actualResult: CheckpointResult): ScenarioResult {
    const expectedVerdict = scenario.expectedVerdict;
    const actualVerdict = actualResult.verdict;
    const verdictMatch = expectedVerdict === actualVerdict;

    const expectedFindings: ExpectedFinding[] = scenario.expectedFindings || [];
    const actualFindings = actualResult.findings || [];

    let falsePositives = 0;
    let falseNegatives = 0;
    let totalGroundingScore = 0;
    let matchedFindings = 0;

    // Track matched expected findings to compute FNs
    const matchedExpectedIndices = new Set<number>();

    for (const actual of actualFindings) {
      // Find a matching expected finding by criterionId
      const matchIndex = expectedFindings.findIndex(
        (ef, idx) => !matchedExpectedIndices.has(idx) && ef.criterionId === actual.criterionId
      );

      if (matchIndex === -1) {
        falsePositives++;
      } else {
        matchedExpectedIndices.add(matchIndex);
        matchedFindings++;
        
        // Calculate grounding score for this finding
        const expectedEvidence = expectedFindings[matchIndex].expectedEvidence;
        if (expectedEvidence && expectedEvidence.length > 0) {
          let foundEvidence = false;
          for (const ev of expectedEvidence) {
            // Check if actual evidence contains the expected file and snippet substring
            const hasMatch = actual.evidence.some(aEv => 
              aEv.file === ev.file &&
              (!ev.snippetSubstr || aEv.snippet.includes(ev.snippetSubstr))
            );
            if (hasMatch) {
              foundEvidence = true;
              break;
            }
          }
          if (foundEvidence) {
            totalGroundingScore += 100;
          }
        } else {
          // If no evidence is expected, award full grounding points
          totalGroundingScore += 100;
        }
      }
    }

    falseNegatives = expectedFindings.length - matchedFindings;

    const averageGroundingScore = matchedFindings > 0 ? (totalGroundingScore / matchedFindings) : 0;
    
    // For PASS scenarios, if no findings expected and none returned, grounding is 100% naturally.
    const finalGroundingScore = (expectedFindings.length === 0 && actualFindings.length === 0) 
      ? 100 
      : averageGroundingScore;

    const success = verdictMatch && falsePositives === 0 && falseNegatives === 0;

    return {
      scenarioId: scenario.id,
      expectedVerdict,
      actualVerdict,
      verdictMatch,
      expectedFindingsCount: expectedFindings.length,
      actualFindingsCount: actualFindings.length,
      falsePositives,
      falseNegatives,
      groundingScore: finalGroundingScore,
      executionTimeMs: actualResult.execution.executionTimeMs,
      success,
      actualOutput: actualResult,
    };
  }

  private aggregateReport(
    dataset: EvalDataset,
    scenarioResults: ScenarioResult[],
    startTime: number
  ): EvalReport {
    const totalScenarios = scenarioResults.length;
    let passedScenarios = 0;
    let failedScenarios = 0;
    let totalFalsePositives = 0;
    let totalFalseNegatives = 0;
    let totalGrounding = 0;
    let totalExecutionTime = 0;
    let verdictMatches = 0;
    let detectionSuccesses = 0;

    for (const result of scenarioResults) {
      if (result.success) passedScenarios++;
      else failedScenarios++;

      if (result.verdictMatch) verdictMatches++;
      if (result.success) detectionSuccesses++;

      totalFalsePositives += result.falsePositives;
      totalFalseNegatives += result.falseNegatives;
      totalGrounding += result.groundingScore;
      totalExecutionTime += result.executionTimeMs;
    }

    return {
      datasetId: dataset.checkpointId,
      datasetVersion: dataset.version,
      model: "eval-runner-default",
      timestamp: new Date().toISOString(),
      metrics: {
        totalScenarios,
        passedScenarios,
        failedScenarios,
        verdictAccuracy: totalScenarios > 0 ? (verdictMatches / totalScenarios) * 100 : 0,
        detectionAccuracy: totalScenarios > 0 ? (detectionSuccesses / totalScenarios) * 100 : 0,
        totalFalsePositives,
        totalFalseNegatives,
        falsePositiveRate: totalScenarios > 0 ? (totalFalsePositives / totalScenarios) : 0,
        falseNegativeRate: totalScenarios > 0 ? (totalFalseNegatives / totalScenarios) : 0,
        averageGroundingAccuracy: totalScenarios > 0 ? (totalGrounding / totalScenarios) : 0,
        averageExecutionTimeMs: totalScenarios > 0 ? (totalExecutionTime / totalScenarios) : 0,
      },
      scenarioResults,
    };
  }
}
