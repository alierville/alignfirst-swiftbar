import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isIgnoredByGit } from "./system.ts";
import { slug, uniqueId } from "./text.ts";
import type { Action, Endpoint, EntryDeclaration, ProjectConfig } from "./types.ts";

export const PROJECT_FILE = join(".local", "workspace-bar.json");

export class ProjectFileError extends Error {}

/** A `${ports.x}` or `port` the worktree does not have. */
export class MissingPortError extends ProjectFileError {}

/** Shown on an entry while its worktree has no AlignFirst ports yet. */
export const PORT_NOT_ALLOCATED = "port not allocated";

/** What a worktree offers to templates. */
export interface TemplateContext {
  ports: Record<string, number>;
  worktree: string;
  branch: string | null;
}

/**
 * The project file is data, but its `open` and `run` entries act on click. It is only read from
 * the main worktree, when git ignores it and does not track it (no commit can bring it), and
 * when the file and its folder are real (no symlink), owned by the user and writable by no one else.
 */
export function assertSafeFile(path: string, uid: number | undefined = process.getuid?.()): void {
  for (const [target, label] of [
    [join(path, ".."), ".local folder"],
    [path, "file"],
  ] as const) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw new ProjectFileError(`${label} refused: symlink`);
    if (uid !== undefined && stat.uid !== uid)
      throw new ProjectFileError(`${label} refused: not owned by the user`);
    if ((stat.mode & 0o022) !== 0)
      throw new ProjectFileError(`${label} refused: writable by others (chmod go-w)`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ACTION_KEYS = ["open", "copy", "terminal", "claude", "finder", "run"] as const;
const ENTRY_KEYS = new Set<string>(["id", "label", "port", "secret", "app", ...ACTION_KEYS]);

function checkEntry(value: unknown, index: number): EntryDeclaration {
  const where = `endpoints[${index}]`;
  if (!isRecord(value)) throw new ProjectFileError(`${where}: object expected`);
  const unknown = Object.keys(value).filter((key) => !ENTRY_KEYS.has(key));
  if (unknown.length > 0) throw new ProjectFileError(`${where}: unknown key ${unknown.join(", ")}`);
  if (typeof value.label !== "string" || value.label.trim() === "")
    throw new ProjectFileError(`${where}: missing label`);
  const label = `"${value.label}"`;
  for (const key of ["id", "open", "app", "copy"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string")
      throw new ProjectFileError(`${label}: ${key} must be a string`);
  }
  for (const key of ["secret", "terminal", "claude", "finder"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      throw new ProjectFileError(`${label}: ${key} must be a boolean`);
  }
  if (value.port !== undefined && typeof value.port !== "string" && !Number.isInteger(value.port)) {
    throw new ProjectFileError(`${label}: port must be a port name or a number`);
  }
  if (value.run !== undefined) {
    const run = value.run;
    if (!Array.isArray(run) || run.length === 0 || !run.every((arg) => typeof arg === "string")) {
      throw new ProjectFileError(`${label}: run must be a list of strings`);
    }
    if (!run[0].startsWith("/"))
      throw new ProjectFileError(`${label}: run[0] must be an absolute path`);
  }
  const actions = ACTION_KEYS.filter((key) => value[key] !== undefined && value[key] !== false);
  if (actions.length !== 1)
    throw new ProjectFileError(`${label}: exactly one action among ${ACTION_KEYS.join(", ")}`);
  if (value.app !== undefined && actions[0] !== "open")
    throw new ProjectFileError(`${label}: app only goes with open`);
  return value as unknown as EntryDeclaration;
}

/** Checks the shape of a parsed project file. */
export function checkConfig(data: unknown): ProjectConfig {
  if (!isRecord(data)) throw new ProjectFileError("JSON object expected");
  const unknown = Object.keys(data).filter((key) => key !== "name" && key !== "endpoints");
  if (unknown.length > 0) throw new ProjectFileError(`unknown key ${unknown.join(", ")}`);
  if (data.name !== undefined && typeof data.name !== "string")
    throw new ProjectFileError("name must be a string");
  if (!Array.isArray(data.endpoints)) throw new ProjectFileError("endpoints must be a list");
  return { name: data.name, endpoints: data.endpoints.map(checkEntry) };
}

/** Reads the project file of a main worktree; null when there is none. */
export function loadProjectFile(mainWorktree: string): ProjectConfig | null {
  const path = join(mainWorktree, PROJECT_FILE);
  try {
    lstatSync(path);
  } catch {
    return null;
  }
  assertSafeFile(path);
  if (!isIgnoredByGit(mainWorktree, PROJECT_FILE))
    throw new ProjectFileError("refused: the file must be ignored and untracked by git");
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ProjectFileError("invalid JSON");
  }
  return checkConfig(data);
}

/** Replaces ${ports.<name>}, ${worktree} and ${branch}. Any other ${…} is an error. */
export function renderTemplate(text: string, context: TemplateContext): string {
  return text.replace(/\$\{([^}]*)\}/g, (_match, name: string) => {
    const key = name.trim();
    if (key === "worktree") return context.worktree;
    if (key === "branch") {
      if (context.branch === null)
        throw new ProjectFileError("${branch}: worktree without a branch");
      return context.branch;
    }
    if (key.startsWith("ports.")) {
      const port = context.ports[key.slice("ports.".length)];
      if (port === undefined)
        throw new MissingPortError(`\${${key}}: unknown port for this worktree`);
      return String(port);
    }
    throw new ProjectFileError(`\${${key}}: unknown variable (ports.<name>, worktree, branch)`);
  });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/** host:port/path of a URL, without credentials, query or fragment; its port when on this machine. */
export function describeUrl(text: string): { display: string; localPort?: number } | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.hostname === "") return null;
  const path = url.pathname === "/" ? "" : url.pathname;
  const display = `${url.hostname}${url.port ? `:${url.port}` : ""}${path}`;
  const localPort = LOCAL_HOSTS.has(url.hostname) && url.port ? Number(url.port) : undefined;
  return { display, localPort };
}

function entryAction(entry: EntryDeclaration, context: TemplateContext): Action {
  const render = (text: string) => renderTemplate(text, context);
  if (entry.open !== undefined) {
    const target = render(entry.open);
    return entry.app !== undefined
      ? { type: "openWith", app: render(entry.app), target }
      : { type: "open", target };
  }
  if (entry.copy !== undefined) return { type: "copy", value: render(entry.copy) };
  if (entry.run !== undefined)
    return { type: "run", argv: entry.run.map(render), cwd: context.worktree };
  if (entry.terminal) return { type: "terminal", dir: context.worktree };
  if (entry.claude) return { type: "claude", dir: context.worktree };
  return { type: "finder", dir: context.worktree };
}

/**
 * The endpoints a project file declares, resolved for one worktree. While the worktree has no
 * AlignFirst ports (`alignfirst dev setup` not run yet), entries that need one are unavailable
 * instead of failing; once it has ports, a missing one is a mistake in the project file.
 */
export function resolveEndpoints(config: ProjectConfig, context: TemplateContext): Endpoint[] {
  const ids = new Set<string>();
  const allocated = Object.keys(context.ports).length > 0;
  return config.endpoints.map((entry) => {
    const id = uniqueId(slug(entry.id ?? entry.label), ids);
    try {
      return resolveEntry(entry, id, context);
    } catch (error) {
      if (allocated || !(error instanceof MissingPortError)) throw error;
      return {
        id,
        label: entry.label,
        kind: "action",
        action: null,
        unavailable: PORT_NOT_ALLOCATED,
      };
    }
  });
}

function resolveEntry(entry: EntryDeclaration, id: string, context: TemplateContext): Endpoint {
  const action = entryAction(entry, context);
  const endpoint: Endpoint = { id, label: entry.label, kind: "action", action };
  if (action.type === "open" || action.type === "openWith") {
    const url = describeUrl(action.target);
    if (url) {
      endpoint.kind = /^https?:/.test(action.target) ? "web" : "database";
      endpoint.display = url.display;
      endpoint.port = url.localPort;
    }
  }
  if (typeof entry.port === "number") endpoint.port = entry.port;
  else if (typeof entry.port === "string") {
    const port = context.ports[entry.port];
    if (port === undefined)
      throw new MissingPortError(`"${entry.label}": unknown port ${entry.port} for this worktree`);
    endpoint.port = port;
  }
  if (action.type === "copy") endpoint.secret = entry.secret ?? true;
  return endpoint;
}

/** Without a project file: the worktree's AlignFirst ports, each copying `localhost:<port>`. */
export function portEndpoints(ports: Record<string, number>): Endpoint[] {
  const ids = new Set<string>();
  return Object.entries(ports).map(([name, port]) => ({
    id: uniqueId(slug(name), ids),
    label: name,
    kind: "port",
    display: `localhost:${port}`,
    port,
    action: { type: "copy", value: `localhost:${port}` },
  }));
}
