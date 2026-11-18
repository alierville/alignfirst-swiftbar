import type { PublicEndpoint, PublicProject, PublicWorktree, WorktreeStatus } from "./types.ts";

// SwiftBar plugin format: one item per line, `--` per submenu level, `| key=value` parameters.
// Only public data reaches it; a click calls the plugin back with ids, never with values.

const DOTS: Record<WorktreeStatus, string> = { up: "🟢", partial: "🟠", down: "🔴", unknown: "⚪" };
const SAFE_PARAM = /^[A-Za-z0-9._-]+$/;

/** Text that cannot break the line format: no `|`, no line break, no leading `-`. */
export function menuText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replaceAll("|", "¦")
    .replace(/^-+/, "")
    .trim();
}

function quote(value: string): string {
  if (!/^[^\s"]+$/.test(value)) {
    if (value.includes('"')) throw new Error(`unsupported plugin path: ${value}`);
    return `"${value}"`;
  }
  return value;
}

function clickParams(plugin: string, args: string[]): string {
  for (const arg of args) if (!SAFE_PARAM.test(arg)) throw new Error(`unsafe identifier: ${arg}`);
  const params = args.map((arg, index) => `param${index + 1}=${arg}`).join(" ");
  return `bash=${quote(plugin)} ${params} terminal=false refresh=false`;
}

function endpointDot(endpoint: PublicEndpoint): string {
  if (endpoint.listening === undefined) return "";
  return endpoint.listening ? "🟢 " : "🔴 ";
}

function endpointLine(
  plugin: string,
  project: PublicProject,
  worktree: PublicWorktree,
  endpoint: PublicEndpoint,
): string {
  if (endpoint.unavailable) {
    return `----${menuText(endpoint.label)}   ${menuText(endpoint.unavailable)} | disabled=true`;
  }
  const label = menuText(endpoint.label) + (endpoint.secret ? " 🔑" : "");
  const display = endpoint.display ? `   ${menuText(endpoint.display)}` : "";
  const params = clickParams(plugin, ["open", project.key, worktree.key, endpoint.id]);
  return `----${endpointDot(endpoint)}${label}${display} | ${params}`;
}

function worktreeLines(plugin: string, project: PublicProject, worktree: PublicWorktree): string[] {
  const name = menuText(worktree.branch ?? worktree.key);
  const dot = worktree.prepared ? DOTS[worktree.status] : "⚪";
  const lines = [`--${dot} ${name}${worktree.devServer ? "  · dev" : ""}`];
  lines.push(`----${menuText(worktree.path)} | disabled=true size=11`);
  if (!worktree.prepared)
    lines.push("----no ports yet (npx alignfirst dev setup) | disabled=true size=11");
  if (worktree.error) lines.push(`----⚠ ${menuText(worktree.error)} | disabled=true color=red`);
  // Endpoints with a port, then the other actions, each group after a separator.
  let previous: boolean | undefined;
  for (const endpoint of worktree.endpoints) {
    const watched = endpoint.port !== undefined;
    if (watched !== previous) lines.push("-------"); // separator inside a level-2 submenu: "----" + "---"
    previous = watched;
    lines.push(endpointLine(plugin, project, worktree, endpoint));
  }
  return lines;
}

export function renderSwiftBar(projects: PublicProject[], plugin: string): string {
  const active = projects
    .flatMap((project) => project.worktrees)
    .filter((tree) => tree.status === "up" || tree.status === "partial");
  const lines = [active.length > 0 ? `AlignFirst · ${active.length}` : "AlignFirst", "---"];
  if (projects.length === 0) lines.push("No project: workspace-bar add <folder> | disabled=true");
  for (const project of projects) {
    lines.push(menuText(project.name));
    if (project.error) lines.push(`--⚠ ${menuText(project.error)} | color=red`);
    for (const worktree of project.worktrees)
      lines.push(...worktreeLines(plugin, project, worktree));
  }
  return `${lines.join("\n")}\n`;
}
