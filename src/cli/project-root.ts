import { findProjectRoot } from "../mcp/root-resolver.js";

export const projectRoot = (): string => findProjectRoot(process.cwd());
