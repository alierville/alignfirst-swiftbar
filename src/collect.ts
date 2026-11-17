import { basename } from "node:path";
import { loadProjectFile, PROJECT_FILE, portEndpoints, resolveEndpoints } from "./project-config.ts";
import { readRegistry } from "./registry.ts";
import { gitWorktrees } from "./system.ts";
import { slug, uniqueId } from "./text.ts";
import type {
  Endpoint,
  ProjectConfig,
  Project,
  PublicEndpoint,
  PublicProject,
  PublicWorktree,
  Worktree,
  WorktreeStatus,
} from "./types.ts";

export interface ProjectEntry {
  key: string;
  path: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toPublicEndpoint(endpoint: Endpoint, listening: Map<number, string> | null): PublicEndpoint {
  const { action: _action, ...rest } = endpoint;
  const result: PublicEndpoint = rest;
  if (endpoint.port !== undefined && listening) result.listening = listening.has(endpoint.port);
  return result;
}

export function statusOf(endpoints: PublicEndpoint[]): WorktreeStatus {
  const watched = endpoints.filter((endpoint) => endpoint.listening !== undefined);
  if (watched.length === 0) return "unknown";
  const up = watched.filter((endpoint) => endpoint.listening).length;
  if (up === watched.length) return "up";
  return up === 0 ? "down" : "partial";
}

/** Drops every action: the result holds no secret and may be printed or rendered. */
export function toPublic(project: Project, listening: Map<number, string> | null): PublicProject {
  return {
    ...project,
    worktrees: project.worktrees.map((worktree): PublicWorktree => {
      const endpoints = worktree.endpoints.map((endpoint) => toPublicEndpoint(endpoint, listening));
      return { ...worktree, endpoints, status: statusOf(endpoints) };
    }),
  };
}

function buildEndpoints(config: ProjectConfig | null, worktree: Omit<Worktree, "endpoints">): Pick<Worktree, "endpoints" | "error"> {
  if (!config) return { endpoints: portEndpoints(worktree.ports) };
  try {
    return { endpoints: resolveEndpoints(config, { ports: worktree.ports, worktree: worktree.path, branch: worktree.branch }) };
  } catch (error) {
    return { endpoints: portEndpoints(worktree.ports), error: `${PROJECT_FILE} : ${message(error)}` };
  }
}

/** Worktrees of a project, with their endpoints and actions (which may hold secrets). */
export function collectProject(entry: ProjectEntry): Project {
  const project: Project = { key: entry.key, name: basename(entry.path), path: entry.path, worktrees: [] };
  let config: ProjectConfig | null = null;
  try {
    config = loadProjectFile(entry.path);
    if (config?.name) project.name = config.name;
  } catch (error) {
    project.error = `${PROJECT_FILE} ignoré : ${message(error)}`;
  }
  try {
    const registry = readRegistry(entry.path);
    const byPath = new Map(registry.workspaces.map((workspace) => [workspace.worktree, workspace]));
    const keys = new Set<string>();
    const git = gitWorktrees(entry.path);
    const paths = [...new Set([...git.map((tree) => tree.path), ...byPath.keys()])];
    for (const path of paths) {
      const registered = byPath.get(path);
      const tree = git.find((candidate) => candidate.path === path);
      const base: Omit<Worktree, "endpoints"> = {
        key: uniqueId(slug(registered?.name ?? basename(path)), keys),
        path,
        branch: tree?.branch ?? null,
        main: registered?.main ?? path === entry.path,
        prepared: registered !== undefined && Object.keys(registered.ports).length > 0,
        devServer: registry.liveDevServers.has(path),
        ports: registered?.ports ?? {},
      };
      if (!tree) {
        project.worktrees.push({ ...base, endpoints: [], error: "dossier absent (workspace orphelin)" });
        continue;
      }
      project.worktrees.push({ ...base, ...buildEndpoints(config, base) });
    }
  } catch (error) {
    project.error = message(error);
  }
  return project;
}
