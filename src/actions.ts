import { execFileSync, spawn } from "node:child_process";
import { OPEN, OSASCRIPT, PBCOPY } from "./system.ts";
import type { Action } from "./types.ts";

// Runs a clicked action. Arguments go straight to the program (no shell), so no value can be
// interpreted as a command.

const CLAUDE_SCRIPT = [
  "on run argv",
  'tell application "Terminal"',
  'do script "cd " & quoted form of (item 1 of argv) & " && claude"',
  "activate",
  "end tell",
  "end run",
];

function detached(file: string, args: string[], cwd?: string): void {
  spawn(file, args, { cwd, detached: true, stdio: "ignore" }).unref();
}

export function runAction(action: Action): void {
  switch (action.type) {
    case "open":
      return detached(OPEN, [action.target]);
    case "openWith":
      return detached(OPEN, ["-a", action.app, action.target]);
    case "copy":
      execFileSync(PBCOPY, [], { input: action.value, timeout: 5000 });
      return;
    case "terminal":
      return detached(OPEN, ["-a", "Terminal", action.dir]);
    case "finder":
      return detached(OPEN, [action.dir]);
    case "claude":
      return detached(OSASCRIPT, [...CLAUDE_SCRIPT.flatMap((line) => ["-e", line]), action.dir]);
    case "run":
      return detached(action.argv[0], action.argv.slice(1), action.cwd);
  }
}
