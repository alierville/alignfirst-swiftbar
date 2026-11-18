import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCheck } from "../src/check.ts";
import type { PublicProject } from "../src/types.ts";

const project: PublicProject = {
  key: "project",
  name: "project",
  path: "/p",
  worktrees: [
    {
      key: "project",
      path: "/p",
      branch: "main",
      main: true,
      prepared: true,
      devServer: true,
      ports: { web: 8000 },
      status: "up",
      endpoints: [
        {
          id: "web",
          label: "Web",
          kind: "web",
          display: "localhost:8000",
          port: 8000,
          listening: true,
        },
        { id: "admin", label: "Admin", kind: "action", secret: true },
        { id: "terminal", label: "Terminal", kind: "action" },
      ],
    },
    {
      key: "project-new",
      path: "/p-new",
      branch: "new",
      main: false,
      prepared: false,
      devServer: false,
      ports: {},
      status: "unknown",
      endpoints: [{ id: "web", label: "Web", kind: "action", unavailable: "port not allocated" }],
    },
  ],
};

test("check prints each worktree's menu", () => {
  const report = renderCheck(project, "/p/.local/workspace-bar.json");
  assert.equal(report.ok, true);
  assert.equal(
    report.text,
    [
      "project  /p",
      "project file: /p/.local/workspace-bar.json",
      "",
      "main  /p  (main, dev)",
      "  Web       localhost:8000 · port 8000 listening",
      "  Admin     secret",
      "  Terminal  action",
      "",
      "new  /p-new",
      "  no ports yet (npx alignfirst dev setup)",
      "  Web  port not allocated",
      "",
    ].join("\n"),
  );
});

test("check fails on a project-file error", () => {
  const broken = structuredClone(project);
  broken.worktrees[0].error = ".local/workspace-bar.json: unknown port";
  const report = renderCheck(broken, "/p/.local/workspace-bar.json");
  assert.equal(report.ok, false);
  assert.match(report.text, /error: \.local\/workspace-bar\.json: unknown port/);
});
