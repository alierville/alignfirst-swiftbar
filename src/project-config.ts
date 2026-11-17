import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isIgnoredByGit } from "./system.ts";
import { slug, uniqueId } from "./text.ts";
import type { Action, Endpoint, EntryDeclaration, ProjectConfig } from "./types.ts";

export const PROJECT_FILE = join(".local", "workspace-bar.json");

export class ProjectFileError extends Error {}

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
    [join(path, ".."), "dossier .local"],
    [path, "fichier"],
  ] as const) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw new ProjectFileError(`${label} refusé : lien symbolique`);
    if (uid !== undefined && stat.uid !== uid) throw new ProjectFileError(`${label} refusé : n'appartient pas à l'utilisateur`);
    if ((stat.mode & 0o022) !== 0) throw new ProjectFileError(`${label} refusé : modifiable par d'autres (chmod go-w)`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ACTION_KEYS = ["open", "copy", "terminal", "claude", "finder", "run"] as const;
const ENTRY_KEYS = new Set<string>(["id", "label", "port", "secret", "app", ...ACTION_KEYS]);

function checkEntry(value: unknown, index: number): EntryDeclaration {
  const where = `endpoints[${index}]`;
  if (!isRecord(value)) throw new ProjectFileError(`${where} : objet attendu`);
  const unknown = Object.keys(value).filter((key) => !ENTRY_KEYS.has(key));
  if (unknown.length > 0) throw new ProjectFileError(`${where} : clé inconnue ${unknown.join(", ")}`);
  if (typeof value.label !== "string" || value.label.trim() === "") throw new ProjectFileError(`${where} : label manquant`);
  const label = `« ${value.label} »`;
  for (const key of ["id", "open", "app", "copy"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") throw new ProjectFileError(`${label} : ${key} doit être une chaîne`);
  }
  for (const key of ["secret", "terminal", "claude", "finder"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") throw new ProjectFileError(`${label} : ${key} doit être un booléen`);
  }
  if (value.port !== undefined && typeof value.port !== "string" && !Number.isInteger(value.port)) {
    throw new ProjectFileError(`${label} : port doit être un nom de port ou un nombre`);
  }
  if (value.run !== undefined) {
    const run = value.run;
    if (!Array.isArray(run) || run.length === 0 || !run.every((arg) => typeof arg === "string")) {
      throw new ProjectFileError(`${label} : run doit être une liste de chaînes`);
    }
    if (!run[0].startsWith("/")) throw new ProjectFileError(`${label} : run[0] doit être un chemin absolu`);
  }
  const actions = ACTION_KEYS.filter((key) => value[key] !== undefined && value[key] !== false);
  if (actions.length !== 1) throw new ProjectFileError(`${label} : une seule action parmi ${ACTION_KEYS.join(", ")}`);
  if (value.app !== undefined && actions[0] !== "open") throw new ProjectFileError(`${label} : app ne va qu'avec open`);
  return value as unknown as EntryDeclaration;
}

/** Checks the shape of a parsed project file. */
export function checkConfig(data: unknown): ProjectConfig {
  if (!isRecord(data)) throw new ProjectFileError("objet JSON attendu");
  const unknown = Object.keys(data).filter((key) => key !== "name" && key !== "endpoints");
  if (unknown.length > 0) throw new ProjectFileError(`clé inconnue ${unknown.join(", ")}`);
  if (data.name !== undefined && typeof data.name !== "string") throw new ProjectFileError("name doit être une chaîne");
  if (!Array.isArray(data.endpoints)) throw new ProjectFileError("endpoints doit être une liste");
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
  if (!isIgnoredByGit(mainWorktree, PROJECT_FILE)) throw new ProjectFileError("refusé : le fichier doit être ignoré par git et non suivi");
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ProjectFileError("JSON invalide");
  }
  return checkConfig(data);
}

/** Replaces ${ports.<name>}, ${worktree} and ${branch}. Any other ${…} is an error. */
export function renderTemplate(text: string, context: TemplateContext): string {
  return text.replace(/\$\{([^}]*)\}/g, (_match, name: string) => {
    const key = name.trim();
    if (key === "worktree") return context.worktree;
    if (key === "branch") {
      if (context.branch === null) throw new ProjectFileError("${branch} : worktree sans branche");
      return context.branch;
    }
    if (key.startsWith("ports.")) {
      const port = context.ports[key.slice("ports.".length)];
      if (port === undefined) throw new ProjectFileError(`\${${key}} : port inconnu de ce worktree`);
      return String(port);
    }
    throw new ProjectFileError(`\${${key}} : variable inconnue (ports.<nom>, worktree, branch)`);
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
    return entry.app !== undefined ? { type: "openWith", app: render(entry.app), target } : { type: "open", target };
  }
  if (entry.copy !== undefined) return { type: "copy", value: render(entry.copy) };
  if (entry.run !== undefined) return { type: "run", argv: entry.run.map(render), cwd: context.worktree };
  if (entry.terminal) return { type: "terminal", dir: context.worktree };
  if (entry.claude) return { type: "claude", dir: context.worktree };
  return { type: "finder", dir: context.worktree };
}

/** The endpoints a project file declares, resolved for one worktree. */
export function resolveEndpoints(config: ProjectConfig, context: TemplateContext): Endpoint[] {
  const ids = new Set<string>();
  return config.endpoints.map((entry) => {
    const action = entryAction(entry, context);
    const endpoint: Endpoint = { id: uniqueId(slug(entry.id ?? entry.label), ids), label: entry.label, kind: "action", action };
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
      if (port === undefined) throw new ProjectFileError(`« ${entry.label} » : port ${entry.port} inconnu de ce worktree`);
      endpoint.port = port;
    }
    if (action.type === "copy") endpoint.secret = entry.secret ?? true;
    return endpoint;
  });
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
