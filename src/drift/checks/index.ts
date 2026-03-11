import type { DriftCheck } from "../types.js";
import { sdkImportCheck } from "./sdk-import.js";
import { commanderImportCheck } from "./commander-import.js";
import { noProcessExitCheck } from "./no-process-exit.js";
import { expectedDirectoriesCheck } from "./expected-directories.js";
import { testColocationCheck } from "./test-colocation.js";
import { commandRegistrationCheck } from "./command-registration.js";
import { milestoneTddConsistencyCheck } from "./milestone-tdd-consistency.js";
import { staleReferencesCheck } from "./stale-references.js";
import { claudeMdFreshnessCheck } from "./claude-md-freshness.js";
import { versionConsistencyCheck } from "./version-consistency.js";
import { tddCoverageCheck } from "./tdd-coverage.js";
import { cliVersionSyncCheck } from "./cli-version-sync.js";

/** All registered drift checks, in display order. */
export const allChecks: readonly DriftCheck[] = [
  sdkImportCheck,
  commanderImportCheck,
  noProcessExitCheck,
  expectedDirectoriesCheck,
  testColocationCheck,
  commandRegistrationCheck,
  milestoneTddConsistencyCheck,
  staleReferencesCheck,
  claudeMdFreshnessCheck,
  versionConsistencyCheck,
  tddCoverageCheck,
  cliVersionSyncCheck,
];
