// Internal model. An Endpoint carries its Action, which may hold a secret (a database URL with
// its password, a value to copy). Actions never leave the process: the menu and the JSON output
// only carry PublicEndpoint, and a click re-resolves the action from its id.

export type EndpointKind = "web" | "database" | "port" | "action";

export type Action =
  | { type: "open"; target: string }
  | { type: "openWith"; app: string; target: string }
  | { type: "copy"; value: string }
  | { type: "terminal"; dir: string }
  | { type: "claude"; dir: string }
  | { type: "finder"; dir: string }
  | { type: "run"; argv: string[]; cwd: string };

export interface Endpoint {
  id: string;
  label: string;
  kind: EndpointKind;
  /** What the menu shows: host, port and path, never credentials or query strings. */
  display?: string;
  port?: number;
  /** The action puts a secret in the clipboard: shown with a key. */
  secret?: boolean;
  action: Action;
}

export interface PublicEndpoint {
  id: string;
  label: string;
  kind: EndpointKind;
  display?: string;
  port?: number;
  listening?: boolean;
  secret?: boolean;
}

export type WorktreeStatus = "up" | "partial" | "down" | "unknown";

export interface Worktree {
  key: string;
  path: string;
  branch: string | null;
  main: boolean;
  /** Registered by AlignFirst, with ports. */
  prepared: boolean;
  /** AlignFirst records a live dev-server for it. */
  devServer: boolean;
  ports: Record<string, number>;
  endpoints: Endpoint[];
  error?: string;
}

export interface PublicWorktree extends Omit<Worktree, "endpoints"> {
  status: WorktreeStatus;
  endpoints: PublicEndpoint[];
}

export interface Project {
  key: string;
  name: string;
  path: string;
  worktrees: Worktree[];
  error?: string;
}

export interface PublicProject extends Omit<Project, "worktrees"> {
  worktrees: PublicWorktree[];
}

export interface Snapshot {
  generatedAt: string;
  projects: PublicProject[];
}

// Project file: <main worktree>/.local/workspace-bar.json. Data only, never executed. Strings may use
// ${ports.<name>} (AlignFirst ports of the worktree), ${worktree} and ${branch}.

export interface EntryDeclaration {
  /** Defaults to a slug of the label. */
  id?: string;
  label: string;
  /** Port watched for the status dot: an AlignFirst port name, or a number. Deduced from a local URL otherwise. */
  port?: string | number;
  /** Marks a `copy` value as a secret (default true for `copy`). */
  secret?: boolean;
  // Exactly one action:
  /** URL opened by macOS (browser, TablePlus for postgres://, …), or with `app`. */
  open?: string;
  app?: string;
  copy?: string;
  terminal?: boolean;
  claude?: boolean;
  finder?: boolean;
  /** Absolute executable path then its arguments, run in the worktree without a shell. */
  run?: string[];
}

export interface ProjectConfig {
  name?: string;
  endpoints: EntryDeclaration[];
}
