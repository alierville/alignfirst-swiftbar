import assert from "node:assert/strict";
import { test } from "node:test";
import { checkConfig, resolveEndpoints } from "../src/project-config.ts";
import { initialProjectFile, SCHEMA_URL } from "../src/scaffold.ts";

test("init writes one entry per AlignFirst port, a valid project file", () => {
  const file = initialProjectFile("project", ["web", "api", "postgres"]);
  assert.equal(file.$schema, SCHEMA_URL);
  assert.equal(file.name, "project");
  assert.deepEqual(file.endpoints.slice(0, 3), [
    { label: "web", open: "http://localhost:${ports.web}", port: "web" },
    { label: "api", open: "http://localhost:${ports.api}", port: "api" },
    { label: "postgres", copy: "localhost:${ports.postgres}", secret: false, port: "postgres" },
  ]);
  const endpoints = resolveEndpoints(checkConfig(file), {
    ports: { web: 8000, api: 8001, postgres: 8002 },
    worktree: "/w",
    branch: "main",
  });
  assert.deepEqual(
    endpoints.map((endpoint) => [endpoint.id, endpoint.port]),
    [
      ["web", 8000],
      ["api", 8001],
      ["postgres", 8002],
      ["terminal-here", undefined],
      ["claude-code-here", undefined],
      ["finder", undefined],
    ],
  );
});

test("without ports, init writes the worktree actions alone", () => {
  const file = initialProjectFile("project", []);
  assert.deepEqual(
    file.endpoints.map((entry) => entry.label),
    ["Terminal here", "Claude Code here", "Finder"],
  );
  assert.doesNotThrow(() => checkConfig(file));
});
