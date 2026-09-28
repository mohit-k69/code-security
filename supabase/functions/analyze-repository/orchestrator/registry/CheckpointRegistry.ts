import type { RegisteredCheckpoint } from "./types.ts";

// Import all Review Specifications
import { AuthenticationSpec } from "../../prompts/specifications/AuthenticationSpec.ts";
import { AuthorizationSpec } from "../../prompts/specifications/AuthorizationSpec.ts";
import { InputValidationSpec } from "../../prompts/specifications/InputValidationSpec.ts";
import { SecretsManagementSpec } from "../../prompts/specifications/SecretsManagementSpec.ts";
import { SessionJwtSpec } from "../../prompts/specifications/SessionJwtSpec.ts";
import { CryptographySpec } from "../../prompts/specifications/CryptographySpec.ts";
import { SecurityConfigurationSpec } from "../../prompts/specifications/SecurityConfigurationSpec.ts";
import { XssSpec } from "../../prompts/specifications/XssSpec.ts";
import { FilePathSecuritySpec } from "../../prompts/specifications/FilePathSecuritySpec.ts";
import { DependencySupplyChainSpec } from "../../prompts/specifications/DependencySupplyChainSpec.ts";

// Import all Evaluation Datasets
import { AuthenticationEvalDataset } from "../../evals/datasets/AuthenticationEvalDataset.ts";
import { AuthorizationEvalDataset } from "../../evals/datasets/AuthorizationEvalDataset.ts";
import { InputValidationEvalDataset } from "../../evals/datasets/InputValidationEvalDataset.ts";
import { SecretsManagementEvalDataset } from "../../evals/datasets/SecretsManagementEvalDataset.ts";
import { SessionJwtEvalDataset } from "../../evals/datasets/SessionJwtEvalDataset.ts";
import { CryptographyEvalDataset } from "../../evals/datasets/CryptographyEvalDataset.ts";
import { SecurityConfigurationEvalDataset } from "../../evals/datasets/SecurityConfigurationEvalDataset.ts";
import { XssEvalDataset } from "../../evals/datasets/XssEvalDataset.ts";
import { FilePathSecurityEvalDataset } from "../../evals/datasets/FilePathSecurityEvalDataset.ts";
import { DependencySupplyChainEvalDataset } from "../../evals/datasets/DependencySupplyChainEvalDataset.ts";

/**
 * The central registry containing all available security checkpoints.
 * This is the single source of truth for both orchestration and evaluation.
 */
export const CHECKPOINT_REGISTRY: RegisteredCheckpoint[] = [
  {
    id: AuthenticationSpec.id,
    name: AuthenticationSpec.name,
    version: AuthenticationSpec.version,
    category: AuthenticationSpec.category,
    spec: AuthenticationSpec,
    dataset: AuthenticationEvalDataset,
    enabled: true,
    routingRules: [], // Runs on all PRs by default
  },
  {
    id: AuthorizationSpec.id,
    name: AuthorizationSpec.name,
    version: AuthorizationSpec.version,
    category: AuthorizationSpec.category,
    spec: AuthorizationSpec,
    dataset: AuthorizationEvalDataset,
    enabled: true,
    routingRules: [], 
  },
  {
    id: InputValidationSpec.id,
    name: InputValidationSpec.name,
    version: InputValidationSpec.version,
    category: InputValidationSpec.category,
    spec: InputValidationSpec,
    dataset: InputValidationEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: SecretsManagementSpec.id,
    name: SecretsManagementSpec.name,
    version: SecretsManagementSpec.version,
    category: SecretsManagementSpec.category,
    spec: SecretsManagementSpec,
    dataset: SecretsManagementEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: SessionJwtSpec.id,
    name: SessionJwtSpec.name,
    version: SessionJwtSpec.version,
    category: SessionJwtSpec.category,
    spec: SessionJwtSpec,
    dataset: SessionJwtEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: CryptographySpec.id,
    name: CryptographySpec.name,
    version: CryptographySpec.version,
    category: CryptographySpec.category,
    spec: CryptographySpec,
    dataset: CryptographyEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: SecurityConfigurationSpec.id,
    name: SecurityConfigurationSpec.name,
    version: SecurityConfigurationSpec.version,
    category: SecurityConfigurationSpec.category,
    spec: SecurityConfigurationSpec,
    dataset: SecurityConfigurationEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: XssSpec.id,
    name: XssSpec.name,
    version: XssSpec.version,
    category: XssSpec.category,
    spec: XssSpec,
    dataset: XssEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: FilePathSecuritySpec.id,
    name: FilePathSecuritySpec.name,
    version: FilePathSecuritySpec.version,
    category: FilePathSecuritySpec.category,
    spec: FilePathSecuritySpec,
    dataset: FilePathSecurityEvalDataset,
    enabled: true,
    routingRules: [],
  },
  {
    id: DependencySupplyChainSpec.id,
    name: DependencySupplyChainSpec.name,
    version: DependencySupplyChainSpec.version,
    category: DependencySupplyChainSpec.category,
    spec: DependencySupplyChainSpec,
    dataset: DependencySupplyChainEvalDataset,
    enabled: true,
    routingRules: [
      "**/package.json", "**/yarn.lock", "**/package-lock.json", 
      "**/pnpm-lock.yaml", "**/build.gradle", "**/pom.xml", 
      "**/.github/workflows/**", "**/Dockerfile"
    ],
  },
];

/**
 * Retrieves all currently enabled checkpoints.
 */
export function getEnabledCheckpoints(): RegisteredCheckpoint[] {
  return CHECKPOINT_REGISTRY.filter((cp) => cp.enabled);
}

/**
 * Retrieves a specific checkpoint by its ID.
 */
export function getCheckpointById(id: string): RegisteredCheckpoint | undefined {
  return CHECKPOINT_REGISTRY.find((cp) => cp.id === id);
}
