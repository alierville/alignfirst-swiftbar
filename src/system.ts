import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

// Every external program is called by absolute path, with an argument list and no shell.
export const GIT = "/usr/bin/git";
export const LSOF = "/usr/sbin/lsof";
export const OPEN = "/usr/bin/open";
export const PBCOPY = "/usr/bin/pbcopy";
export const OSASCRIPT = "/usr/bin/osascript";

function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
}

/** Main worktree of the repository containing `dir`. */
export function mainWorktreeOf(dir: string): string {
  const common = run(GIT, ["-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  return common.endsWith("/.git") ? dirname(common) : resolve(common);
}

export interface GitWorktree {
  path: string;
  branch: string | null;
}

export function parseWorktreeList(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | null = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length), branch: null };
      worktrees.push(current);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (current && line === "bare") {
      worktrees.pop();
      current = null;
    }
  }
  return worktrees;
}

export function gitWorktrees(mainWorktree: string): GitWorktree[] {
  return parseWorktreeList(run(GIT, ["-C", mainWorktree, "worktree", "list", "--porcelain"]));
}

/** `lsof -F` output → listening TCP port → command name. */
export function parseLsof(output: string): Map<number, string> {
  const ports = new Map<number, string>();
  let command = "";
  for (const line of output.split("\n")) {
    if (line.startsWith("c")) command = line.slice(1);
    else if (line.startsWith("n")) {
      const port = Number(line.slice(line.lastIndexOf(":") + 1));
      if (Number.isInteger(port) && port > 0 && !ports.has(port)) ports.set(port, command);
    }
  }
  return ports;
}

/** Ports in LISTEN state, as far as this user can see (their own processes, Docker included). */
export function listeningPorts(): Map<number, string> | null {
  try {
    return parseLsof(run(LSOF, ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]));
  } catch (error) {
    // lsof exits 1 when nothing listens; its output is still usable.
    const stdout = (error as { stdout?: string }).stdout;
    return typeof stdout === "string" ? parseLsof(stdout) : null;
  }
}

/** True when git ignores `relative` in `repo` and does not track it. */
export function isIgnoredByGit(repo: string, relative: string): boolean {
  try {
    execFileSync(GIT, ["-C", repo, "check-ignore", "-q", "--", relative], { timeout: 5000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
