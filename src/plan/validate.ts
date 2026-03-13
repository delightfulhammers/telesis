import type { PlanTask } from "./types.js";

/** Result of topological sort — either a valid order or an error with cycle info */
export type TopologicalSortResult =
  | { readonly valid: true; readonly order: readonly string[] }
  | {
      readonly valid: false;
      readonly error: string;
      readonly cycle?: readonly string[];
    };

/**
 * Topological sort using Kahn's algorithm.
 * Returns a valid execution order or identifies cycles.
 */
export const topologicalSort = (
  tasks: readonly PlanTask[],
): TopologicalSortResult => {
  if (tasks.length === 0) {
    return { valid: true, order: [] };
  }

  const taskIds = new Set(tasks.map((t) => t.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) continue;
      adjacency.get(dep)!.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (order.length < tasks.length) {
    const cycle = tasks.filter((t) => !order.includes(t.id)).map((t) => t.id);
    return {
      valid: false,
      error: `Dependency cycle detected among tasks: ${cycle.join(", ")}`,
      cycle,
    };
  }

  return { valid: true, order };
};

/** Validate plan tasks — returns error messages (empty array if valid) */
export const validatePlanTasks = (
  tasks: readonly PlanTask[],
): readonly string[] => {
  const errors: string[] = [];

  if (tasks.length === 0) {
    errors.push("Plan must have at least one task");
    return errors;
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      errors.push(`Duplicate task ID: "${task.id}"`);
    }
    ids.add(task.id);
  }

  // Check for missing required fields
  for (const task of tasks) {
    if (!task.id || task.id.trim().length === 0) {
      errors.push("Task has empty or missing ID");
    }
    if (!task.title || task.title.trim().length === 0) {
      errors.push(`Task "${task.id}" has empty or missing title`);
    }
    if (!task.description || task.description.trim().length === 0) {
      errors.push(`Task "${task.id}" has empty or missing description`);
    }
  }

  // Short-circuit: duplicate IDs make dependency analysis unreliable
  if (errors.length > 0) {
    return errors;
  }

  // Check for orphan dependency references
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Task "${task.id}" depends on non-existent task "${dep}"`);
      }
    }
  }

  // Check for cycles
  const sortResult = topologicalSort(tasks);
  if (!sortResult.valid) {
    errors.push(sortResult.error);
  }

  return errors;
};
