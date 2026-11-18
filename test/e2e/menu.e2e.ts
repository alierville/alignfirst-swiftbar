// End-to-end: a real project, workspaces and dev server built by the pinned AlignFirst CLI, then
// workspace-bar run as SwiftBar would. Everything lives in a temp folder, with a temp HOME.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { PublicWorktree, Snapshot } from "../../src/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = join(ROOT, "test", "fixtures", "e2e-project");
const ALIGNFIRST = join(ROOT, "node_modules", ".bin", "alignfirst");
const CLI = join(ROOT, "src", "cli.ts");
const SECRETS = ["e2e-secret-password", "e2e-secret-copy"];

// realpath: on macOS tmpdir() is under a /var symlink, while git and AlignFirst report /private/var.
const tmp = realpathSync(mkdtempSync(join(tmpdir(), "workspace-bar-e2e-")));
const main = join(tmp, "proj");
const feature = join(tmp, "proj-feature");
const bare = join(tmp, "proj-bare");

const env: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: join(tmp, "home"),
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@example.invalid",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@example.invalid",
  WORKSPACE_BAR_HOME: join(tmp, "workspace-bar"),
  WORKSPACE_BAR_PLUGIN: join(tmp, "plugin.sh"),
};

function run(file: string, args: string[], cwd: string): string {
  const result = spawnSync(file, args, { cwd, env, encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) {
    throw new Error(
      `${file} ${args.join(" ")} (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

const git = (args: string[], cwd = main) => run("/usr/bin/git", args, cwd);
const alignfirst = (args: string[], cwd = main) => run(ALIGNFIRST, args, cwd);
const workspaceBar = (...args: string[]) =>
  run(process.execPath, ["--disable-warning=ExperimentalWarning", CLI, ...args], ROOT);

function snapshot(): Snapshot {
  return JSON.parse(workspaceBar("json")) as Snapshot;
}

function worktree(data: Snapshot, branch: string): PublicWorktree {
  const found = data.projects[0]?.worktrees.find((candidate) => candidate.branch === branch);
  assert.ok(found, `worktree ${branch} missing`);
  return found;
}

before(() => {
  mkdirSync(env.HOME as string);
  mkdirSync(main);
  for (const name of ["alignfirst.json", "server.mjs"]) {
    copyFileSync(join(FIXTURE, name), join(main, name));
  }
  copyFileSync(join(FIXTURE, "gitignore"), join(main, ".gitignore"));
  mkdirSync(join(main, ".local"), { mode: 0o700 });
  copyFileSync(join(FIXTURE, "workspace-bar.json"), join(main, ".local", "workspace-bar.json"));
  chmodSync(join(main, ".local", "workspace-bar.json"), 0o600);
  mkdirSync(join(main, ".plans"));

  git(["init", "-q", "-b", "main"]);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "fixture"]);

  alignfirst(["workspace", "setup"]);
  alignfirst(["dev", "setup"]);
  alignfirst(["workspace", "setup", "-c", "feature"]);
  alignfirst(["dev", "up"], feature);
  git(["worktree", "add", "-q", "-b", "bare-wt", bare]);

  workspaceBar("add", main);
});

after(() => {
  const steps: [string, () => unknown][] = [
    ["dev down", () => alignfirst(["dev", "down"], feature)],
    ["teardown feature", () => alignfirst(["workspace", "teardown", feature])],
    ["teardown main", () => alignfirst(["workspace", "teardown"])],
  ];
  for (const [name, step] of steps) {
    try {
      step();
    } catch (error) {
      console.error(`cleanup ${name} failed:`, error);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
});

test("worktrees, dev server and status dots come from the real AlignFirst setup", () => {
  const data = snapshot();
  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].name, "E2E");
  assert.equal(data.projects[0].worktrees.length, 3);

  const mainTree = worktree(data, "main");
  assert.equal(mainTree.main, true);
  assert.equal(mainTree.prepared, true);
  assert.equal(mainTree.devServer, false);
  assert.equal(mainTree.status, "down");

  const featureTree = worktree(data, "feature");
  assert.equal(featureTree.prepared, true);
  assert.equal(featureTree.devServer, true);
  assert.equal(featureTree.status, "partial");
  const listening = Object.fromEntries(
    featureTree.endpoints.map((endpoint) => [endpoint.id, endpoint.listening]),
  );
  assert.equal(listening.web, true);
  assert.equal(listening.db, false);

  // No ports before `alignfirst dev setup`: entries that need one wait, the others work.
  const bareTree = worktree(data, "bare-wt");
  assert.equal(bareTree.prepared, false);
  assert.equal(bareTree.error, undefined);
  const unavailable = Object.fromEntries(
    bareTree.endpoints.map((endpoint) => [endpoint.id, endpoint.unavailable]),
  );
  assert.deepEqual(unavailable, {
    web: "port not allocated",
    db: "port not allocated",
    secret: undefined,
    marker: undefined,
  });
});

test("the SwiftBar menu shows the dev server and the unprepared worktree", () => {
  const menu = workspaceBar("swiftbar");
  assert.match(menu, /🟠 feature {2}· dev/);
  assert.match(menu, /no ports yet/);
  assert.match(menu, /Web {3}port not allocated \| disabled=true/);
  assert.doesNotMatch(menu, /unknown port/);
});

test("check prints the menu of every worktree", () => {
  const report = workspaceBar("check", main);
  assert.match(report, /^E2E {2}/);
  assert.match(report, /feature {2}\S+proj-feature {2}\(dev\)/);
  assert.match(report, /Web +localhost:\d+ · port \d+ listening/);
  assert.match(report, /Web +port not allocated/);
});

test("no secret reaches the JSON, the menu or the check report", () => {
  const outputs = [workspaceBar("json"), workspaceBar("swiftbar"), workspaceBar("check", main)];
  for (const output of outputs) {
    for (const secret of SECRETS) assert.ok(!output.includes(secret), `${secret} leaked`);
  }
});

test("a click runs the declared action in its worktree", async () => {
  const data = snapshot();
  const project = data.projects[0];
  workspaceBar("open", project.key, worktree(data, "feature").key, "marker");
  const marker = join(feature, "clicked");
  // The action is detached: wait for it, within a bound.
  for (let waited = 0; !existsSync(marker) && waited < 5000; waited += 100) {
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(existsSync(marker), "the click did not run");
});

test("a project file in a folder writable by others is refused", () => {
  const local = join(main, ".local");
  chmodSync(local, 0o770);
  try {
    assert.match(workspaceBar("swiftbar"), /writable by others/);
  } finally {
    chmodSync(local, 0o700);
  }
});

test("init writes a project file from the registry's ports", () => {
  const file = join(main, ".local", "workspace-bar.json");
  const kept = `${file}.kept`;
  renameSync(file, kept);
  try {
    workspaceBar("init", main);
    const written = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(written.endpoints.slice(0, 2), [
      { label: "web", open: "http://localhost:${ports.web}", port: "web" },
      { label: "db", copy: "localhost:${ports.db}", secret: false, port: "db" },
    ]);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.doesNotThrow(() => workspaceBar("check", main));
  } finally {
    rmSync(file, { force: true });
    renameSync(kept, file);
  }
});
