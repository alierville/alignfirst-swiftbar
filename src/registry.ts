import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read-only access to the AlignFirst workspace registry of a project, in project storage mode:
// <main worktree>/.local-wt/workspace-registry. Only the formats below are accepted; anything else
// fails closed instead of being guessed.

const SUPPORTED_WORKSPACES_VERSION = 4;
const SUPPORTED_DEV_SERVERS_VERSION = 1;

export interface RegisteredWorkspace {
  name: string;
  worktree: string;
  main: boolean;
  ports: Record<string, number>;
}

export interface Registry {
  workspaces: RegisteredWorkspace[];
  /** Worktree paths with a dev-server whose processes are alive. */
  liveDevServers: Set<string>;
}

export class RegistryError extends Error {}

export function registryDir(mainWorktree: string): string {
  return join(mainWorktree, ".local-wt", "workspace-registry");
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new RegistryError(`registre illisible : ${path}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPorts(value: unknown): Record<string, number> {
  const ports: Record<string, number> = {};
  if (!isRecord(value)) return ports;
  for (const [name, port] of Object.entries(value)) {
    if (Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536)
      ports[name] = port as number;
  }
  return ports;
}

export function parseWorkspaces(data: unknown): RegisteredWorkspace[] {
  if (
    !isRecord(data) ||
    data.version !== SUPPORTED_WORKSPACES_VERSION ||
    !isRecord(data.workspaces)
  ) {
    const version = isRecord(data) ? String(data.version) : "?";
    throw new RegistryError(`format de registre non pris en charge (workspaces v${version})`);
  }
  const workspaces: RegisteredWorkspace[] = [];
  for (const [name, entry] of Object.entries(data.workspaces)) {
    if (!isRecord(entry) || typeof entry.worktree !== "string") continue;
    workspaces.push({
      name,
      worktree: entry.worktree,
      main: entry.main === true,
      ports: readPorts(entry.ports),
    });
  }
  return workspaces;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function parseDevServers(
  data: unknown,
  alive: (pid: number) => boolean = isAlive,
): Set<string> {
  const live = new Set<string>();
  if (data === undefined) return live;
  if (
    !isRecord(data) ||
    data.version !== SUPPORTED_DEV_SERVERS_VERSION ||
    !Array.isArray(data.servers)
  ) {
    throw new RegistryError("format de registre non pris en charge (dev-servers)");
  }
  for (const server of data.servers) {
    if (!isRecord(server) || typeof server.worktree !== "string" || !isRecord(server.pids))
      continue;
    const pids = Object.values(server.pids).filter((pid): pid is number => Number.isInteger(pid));
    if (pids.some(alive)) live.add(server.worktree);
  }
  return live;
}

export function readRegistry(mainWorktree: string): Registry {
  const dir = registryDir(mainWorktree);
  const workspaces = readJson(join(dir, "workspaces.json"));
  if (workspaces === undefined)
    throw new RegistryError("aucun registre AlignFirst (workspace setup jamais lancé ?)");
  return {
    workspaces: parseWorkspaces(workspaces),
    liveDevServers: parseDevServers(readJson(join(dir, "dev-servers.json"))),
  };
}
