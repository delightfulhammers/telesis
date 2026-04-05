import { Command } from "commander";
import { projectRoot } from "./project-root.js";
import { handleAction } from "./handle-action.js";
import {
  installHook,
  uninstallHook,
  isHookInstalled,
} from "../hooks/install.js";
import { findGitRoot } from "../hooks/git-root.js";

const resolveRoots = (): { rootDir: string; gitRoot: string } => {
  const rootDir = projectRoot();
  const gitRoot = findGitRoot(rootDir);
  if (!gitRoot) {
    throw new Error(`Not inside a git repository. Run 'git init' first.`);
  }
  return { rootDir, gitRoot };
};

const installCommand = new Command("install")
  .description(
    "Install telesis git pre-commit hook for provider-neutral enforcement",
  )
  .action(
    handleAction(() => {
      const { rootDir, gitRoot } = resolveRoots();

      if (isHookInstalled(rootDir, gitRoot)) {
        console.log("Telesis git hook is already installed.");
        return;
      }

      installHook(rootDir, gitRoot);
      console.log("Installed telesis pre-commit hook to .git/hooks/pre-commit");
    }),
  );

const uninstallCommand = new Command("uninstall")
  .description("Remove telesis git pre-commit hook")
  .action(
    handleAction(() => {
      const { rootDir, gitRoot } = resolveRoots();

      if (!isHookInstalled(rootDir, gitRoot)) {
        console.log("Telesis git hook is not installed.");
        return;
      }

      uninstallHook(rootDir, gitRoot);
      console.log("Removed telesis pre-commit hook from .git/hooks/pre-commit");
    }),
  );

export const hooksCommand = new Command("hooks")
  .description("Manage provider-neutral git hooks for telesis enforcement")
  .addCommand(installCommand)
  .addCommand(uninstallCommand);
