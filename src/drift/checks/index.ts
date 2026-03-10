import type { DriftCheck } from "../types.js";
import { sdkImportCheck } from "./sdk-import.js";
import { commanderImportCheck } from "./commander-import.js";
import { noProcessExitCheck } from "./no-process-exit.js";
import { expectedDirectoriesCheck } from "./expected-directories.js";
import { testColocationCheck } from "./test-colocation.js";
import { commandRegistrationCheck } from "./command-registration.js";

/** All registered drift checks, in display order. */
export const allChecks: readonly DriftCheck[] = [
  sdkImportCheck,
  commanderImportCheck,
  noProcessExitCheck,
  expectedDirectoriesCheck,
  testColocationCheck,
  commandRegistrationCheck,
];
