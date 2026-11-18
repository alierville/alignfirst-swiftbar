import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDevServers, parseWorkspaces } from "../src/registry.ts";
import { parseLsof, parseWorktreeList } from "../src/system.ts";

test("workspaces v4 are read, other versions fail closed", () => {
  const workspaces = parseWorkspaces({
    version: 4,
    workspaces: {
      project: { worktree: "/p", main: true, ports: { api: 8301, bad: "x", huge: 70000 } },
      broken: { ports: {} },
    },
  });
  assert.deepEqual(workspaces, [
    { name: "project", worktree: "/p", main: true, ports: { api: 8301 } },
  ]);
  assert.throws(() => parseWorkspaces({ version: 5, workspaces: {} }), /v5/);
  assert.throws(() => parseWorkspaces([]), /unsupported registry format/);
});

test("a dev-server counts when one of its processes is alive", () => {
  const data = {
    version: 1,
    servers: [
      { worktree: "/a", pids: { api: 1, console: 2 } },
      { worktree: "/b", pids: { api: 3 } },
    ],
  };
  assert.deepEqual([...parseDevServers(data, (pid) => pid === 2)], ["/a"]);
  assert.equal(parseDevServers(undefined).size, 0);
  assert.throws(() => parseDevServers({ version: 2, servers: [] }));
});

test("git worktree list --porcelain", () => {
  const output =
    "worktree /p\nHEAD abc\nbranch refs/heads/main\n\nworktree /p-53\nHEAD def\nbranch refs/heads/53/bar\n\nworktree /d\nHEAD 123\ndetached\n";
  assert.deepEqual(parseWorktreeList(output), [
    { path: "/p", branch: "main" },
    { path: "/p-53", branch: "53/bar" },
    { path: "/d", branch: null },
  ]);
});

test("lsof -F listening ports, IPv4 and IPv6", () => {
  const output = "p101\ncnode\nn127.0.0.1:8301\nn[::1]:8302\np202\nccom.docker.backend\nn*:8300\n";
  assert.deepEqual(
    [...parseLsof(output)],
    [
      [8301, "node"],
      [8302, "node"],
      [8300, "com.docker.backend"],
    ],
  );
});
