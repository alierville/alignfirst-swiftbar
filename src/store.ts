import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ProjectEntry } from "./collect.ts";
import { slug, uniqueId } from "./text.ts";

// The list of followed projects: ~/.config/workspace-bar/projects.json, readable by the user only.

export function storeDir(): string {
  return process.env.WORKSPACE_BAR_HOME ?? join(homedir(), ".config", "workspace-bar");
}

function storeFile(): string {
  return join(storeDir(), "projects.json");
}

export function readProjects(): ProjectEntry[] {
  try {
    const data = JSON.parse(readFileSync(storeFile(), "utf8")) as { projects?: unknown };
    if (!Array.isArray(data.projects)) return [];
    return data.projects.filter(
      (entry): entry is ProjectEntry => typeof entry?.key === "string" && typeof entry?.path === "string",
    );
  } catch {
    return [];
  }
}

function writeProjects(projects: ProjectEntry[]): void {
  mkdirSync(storeDir(), { recursive: true, mode: 0o700 });
  chmodSync(storeDir(), 0o700);
  const temporary = `${storeFile()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, storeFile());
}

export function addProject(path: string): ProjectEntry {
  const projects = readProjects();
  const existing = projects.find((entry) => entry.path === path);
  if (existing) return existing;
  const entry = { key: uniqueId(slug(basename(path)), new Set(projects.map((p) => p.key))), path };
  writeProjects([...projects, entry]);
  return entry;
}

export function removeProject(keyOrPath: string): ProjectEntry | undefined {
  const projects = readProjects();
  const target = projects.find((entry) => entry.key === keyOrPath || entry.path === keyOrPath);
  if (target) writeProjects(projects.filter((entry) => entry !== target));
  return target;
}
