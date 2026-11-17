import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { toPublic } from "../src/collect.ts";
import {
  assertSafeFile,
  checkConfig,
  describeUrl,
  portEndpoints,
  renderTemplate,
  resolveEndpoints,
} from "../src/project-config.ts";
import type { Project } from "../src/types.ts";

const context = { ports: { postgres: 8300, api: 8301, console: 8302 }, worktree: "/work/tree", branch: "53/bar" };

test("templates know ports, worktree and branch, nothing else", () => {
  assert.equal(renderTemplate("http://localhost:${ports.api}/x", context), "http://localhost:8301/x");
  assert.equal(renderTemplate("${worktree} ${ branch }", context), "/work/tree 53/bar");
  assert.throws(() => renderTemplate("${ports.nope}", context), /port inconnu/);
  assert.throws(() => renderTemplate("${env.OPENAI_API_KEY}", context), /variable inconnue/);
  assert.throws(() => renderTemplate("${branch}", { ...context, branch: null }), /sans branche/);
});

test("displays never carry credentials, queries or fragments", () => {
  assert.deepEqual(describeUrl("postgres://u:pw@localhost:8300/db"), { display: "localhost:8300/db", localPort: 8300 });
  assert.deepEqual(describeUrl("https://user:pw@example.com/a?token=x#f"), { display: "example.com/a", localPort: undefined });
  assert.equal(describeUrl("not a url"), null);
});

test("declared endpoints, in order, with ports for the status dots", () => {
  const config = checkConfig({
    name: "project",
    endpoints: [
      { label: "Console", open: "http://localhost:${ports.console}" },
      { label: "Base", open: "postgres://u:pw@localhost:${ports.postgres}/db", app: "Postico" },
      { label: "Remote", open: "https://example.com", port: "api" },
      { label: "Admin", copy: "admin pw" },
      { label: "Lien", copy: "x", secret: false },
      { label: "Terminal", terminal: true },
      { label: "Code", run: ["/usr/local/bin/code", "${worktree}"] },
    ],
  });
  const endpoints = resolveEndpoints(config, context);
  assert.deepEqual(
    endpoints.map((endpoint) => [endpoint.id, endpoint.kind, endpoint.display, endpoint.port, endpoint.secret]),
    [
      ["console", "web", "localhost:8302", 8302, undefined],
      ["base", "database", "localhost:8300/db", 8300, undefined],
      ["remote", "web", "example.com", 8301, undefined],
      ["admin", "action", undefined, undefined, true],
      ["lien", "action", undefined, undefined, false],
      ["terminal", "action", undefined, undefined, undefined],
      ["code", "action", undefined, undefined, undefined],
    ],
  );
  assert.deepEqual(endpoints[1].action, { type: "openWith", app: "Postico", target: "postgres://u:pw@localhost:8300/db" });
  assert.deepEqual(endpoints[6].action, { type: "run", argv: ["/usr/local/bin/code", "/work/tree"], cwd: "/work/tree" });
});

test("the file shape is checked strictly", () => {
  assert.throws(() => checkConfig([]), /objet JSON/);
  assert.throws(() => checkConfig({ endpoints: {} }), /liste/);
  assert.throws(() => checkConfig({ endpoints: [], extra: 1 }), /clé inconnue extra/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x" }] }), /une seule action/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x", copy: "a", open: "b" }] }), /une seule action/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x", copy: "a", app: "B" }] }), /app ne va qu'avec open/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x", run: ["code", "."] }] }), /chemin absolu/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x", terminal: "yes" }] }), /booléen/);
  assert.throws(() => checkConfig({ endpoints: [{ label: "x", copy: "a", shell: "rm" }] }), /clé inconnue shell/);
  assert.throws(() => resolveEndpoints(checkConfig({ endpoints: [{ label: "x", copy: "a", port: "nope" }] }), context), /port nope/);
});

test("without a project file, the AlignFirst ports alone", () => {
  assert.deepEqual(
    portEndpoints({ api: 8301 }).map((endpoint) => [endpoint.id, endpoint.display, endpoint.action]),
    [["api", "localhost:8301", { type: "copy", value: "localhost:8301" }]],
  );
});

test("the public view drops every action, so no copied value or password", () => {
  const endpoints = resolveEndpoints(
    checkConfig({
      endpoints: [
        { label: "Base", open: "postgres://u:pw@localhost:${ports.postgres}/db" },
        { label: "Admin", copy: "top-secret" },
      ],
    }),
    context,
  );
  const project: Project = {
    key: "p",
    name: "p",
    path: "/work/tree",
    worktrees: [{ key: "w", path: "/work/tree", branch: "main", main: true, prepared: true, devServer: false, ports: {}, endpoints }],
  };
  const text = JSON.stringify(toPublic(project, new Map([[8300, "postgres"]])));
  assert.doesNotMatch(text, /top-secret|u:pw|"action":/);
  assert.match(text, /"listening":true/);
});

test("the project file is refused when others can write it or it is a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "workspace-bar-"));
  const local = join(root, ".local");
  mkdirSync(local, { mode: 0o755 });
  const file = join(local, "workspace-bar.json");
  writeFileSync(file, "{}", { mode: 0o600 });
  assert.doesNotThrow(() => assertSafeFile(file));
  chmodSync(file, 0o620);
  assert.throws(() => assertSafeFile(file), /modifiable par d'autres/);
  chmodSync(file, 0o600);
  chmodSync(local, 0o777);
  assert.throws(() => assertSafeFile(file), /dossier \.local refusé/);
  chmodSync(local, 0o755);
  assert.throws(() => assertSafeFile(file, 12345), /n'appartient pas/);
  const linked = join(local, "linked.json");
  symlinkSync(file, linked);
  assert.throws(() => assertSafeFile(linked), /lien symbolique/);
});
