import type { PublicEndpoint, PublicProject, PublicWorktree } from "./types.ts";

// `check`: the menu a project would get, as plain text for a terminal. Public data only, like the
// menu: no copied value, no password.

function endpointDetail(endpoint: PublicEndpoint): string {
  if (endpoint.unavailable) return endpoint.unavailable;
  const parts: string[] = [];
  if (endpoint.display) parts.push(endpoint.display);
  if (endpoint.port !== undefined) {
    const state =
      endpoint.listening === undefined ? "" : endpoint.listening ? " listening" : " not listening";
    parts.push(`port ${endpoint.port}${state}`);
  }
  if (endpoint.secret) parts.push("secret");
  return parts.join(" · ") || endpoint.kind;
}

function worktreeLines(worktree: PublicWorktree): string[] {
  const tags = [worktree.main ? "main" : "", worktree.devServer ? "dev" : ""].filter(Boolean);
  const head = `${worktree.branch ?? worktree.key}  ${worktree.path}`;
  const lines = [tags.length > 0 ? `${head}  (${tags.join(", ")})` : head];
  if (!worktree.prepared) lines.push("  no ports yet (npx alignfirst dev setup)");
  if (worktree.error) lines.push(`  error: ${worktree.error}`);
  const width = Math.max(0, ...worktree.endpoints.map((endpoint) => endpoint.label.length));
  for (const endpoint of worktree.endpoints) {
    lines.push(`  ${endpoint.label.padEnd(width)}  ${endpointDetail(endpoint)}`);
  }
  return lines;
}

/** The report, and whether it found an error. */
export function renderCheck(
  project: PublicProject,
  projectFile: string | null,
): { text: string; ok: boolean } {
  const lines = [`${project.name}  ${project.path}`];
  lines.push(
    projectFile ? `project file: ${projectFile}` : "no project file: the AlignFirst ports alone",
  );
  if (project.error) lines.push(`error: ${project.error}`);
  for (const worktree of project.worktrees) lines.push("", ...worktreeLines(worktree));
  const ok = !project.error && project.worktrees.every((worktree) => !worktree.error);
  return { text: `${lines.join("\n")}\n`, ok };
}
