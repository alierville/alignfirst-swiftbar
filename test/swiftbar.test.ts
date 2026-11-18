import assert from "node:assert/strict";
import { test } from "node:test";
import { menuText, renderSwiftBar } from "../src/swiftbar.ts";
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
      ports: { api: 8301, console: 8302 },
      status: "partial",
      endpoints: [
        {
          id: "api",
          label: "API",
          kind: "web",
          display: "localhost:8301",
          port: 8301,
          listening: true,
        },
        {
          id: "console",
          label: "Console",
          kind: "web",
          display: "localhost:8302",
          port: 8302,
          listening: false,
        },
        { id: "admin", label: "Admin", kind: "action", secret: true },
      ],
    },
  ],
};

test("menu: count, project, worktree dot, endpoint dots, clicks by id", () => {
  const menu = renderSwiftBar([project], "/plugins/workspace-bar.1m.sh");
  assert.equal(
    menu,
    [
      "AlignFirst · 1",
      "---",
      "project",
      "--🟠 main  · dev",
      "----/p | disabled=true size=11",
      "-------",
      "----🟢 API   localhost:8301 | bash=/plugins/workspace-bar.1m.sh param1=open param2=project param3=project param4=api terminal=false refresh=false",
      "----🔴 Console   localhost:8302 | bash=/plugins/workspace-bar.1m.sh param1=open param2=project param3=project param4=console terminal=false refresh=false",
      "-------",
      "----Admin 🔑 | bash=/plugins/workspace-bar.1m.sh param1=open param2=project param3=project param4=admin terminal=false refresh=false",
      "---",
      "Refresh | refresh=true",
      "",
    ].join("\n"),
  );
});

test("an unavailable endpoint is greyed out, without a click", () => {
  const pending = structuredClone(project);
  pending.worktrees[0].endpoints = [
    { id: "console", label: "Console", kind: "action", unavailable: "port not allocated" },
  ];
  assert.match(
    renderSwiftBar([pending], "/plugin"),
    /\n----Console {3}port not allocated \| disabled=true\n/,
  );
});

test("labels cannot inject SwiftBar parameters or lines", () => {
  assert.equal(menuText("--evil | bash=/bin/sh\nnext"), "evil ¦ bash=/bin/sh next");
});

test("unsafe ids are refused rather than passed to SwiftBar", () => {
  const unsafe = structuredClone(project);
  unsafe.worktrees[0].endpoints[0].id = "a b";
  assert.throws(() => renderSwiftBar([unsafe], "/plugin"), /unsafe identifier/);
  assert.match(renderSwiftBar([project], "/my plugins/x.sh"), /bash="\/my plugins\/x.sh"/);
});
