import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAction } from "./actions.ts";
import { collectProject, toPublic } from "./collect.ts";
import { PROJECT_FILE } from "./project-config.ts";
import { registryDir } from "./registry.ts";
import { addProject, readProjects, removeProject, storeDir } from "./store.ts";
import { renderSwiftBar } from "./swiftbar.ts";
import { isIgnoredByGit, listeningPorts, mainWorktreeOf } from "./system.ts";
import type { Snapshot } from "./types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_PREFIX = "workspace-bar.";
const DEFAULT_INTERVAL = "10s";

const USAGE = `workspace-bar — endpoints des workspaces AlignFirst dans la barre des menus

  add <dossier>          suivre le dépôt qui contient ce dossier
  remove <clé|dossier>   ne plus le suivre
  list                   dépôts suivis
  init <dossier>         créer ${PROJECT_FILE} dans le worktree principal
  json                   état complet en JSON (sans aucun secret)
  swiftbar               menu au format SwiftBar
  install [dossier] [--every 5m]
                         installer le plugin SwiftBar, rafraîchi à cet intervalle (30s, 5m, 1h…)
`;

function fail(text: string): never {
  process.stderr.write(`workspace-bar: ${text}\n`);
  process.exit(1);
}

function snapshot(): Snapshot {
  const listening = listeningPorts();
  const projects = readProjects().map(collectProject);
  return {
    generatedAt: new Date().toISOString(),
    projects: projects.map((project) => toPublic(project, listening)),
  };
}

function resolveMain(dir: string | undefined): string {
  if (!dir) fail("dossier manquant");
  try {
    return mainWorktreeOf(resolve(dir));
  } catch {
    fail(`pas un dépôt git : ${dir}`);
  }
}

function open(projectKey: string, worktreeKey: string, endpointId: string): void {
  const entry = readProjects().find((project) => project.key === projectKey);
  if (!entry) fail(`projet inconnu : ${projectKey}`);
  const project = collectProject(entry);
  const endpoint = project.worktrees
    .find((worktree) => worktree.key === worktreeKey)
    ?.endpoints.find((candidate) => candidate.id === endpointId);
  if (!endpoint) fail(`endpoint introuvable : ${worktreeKey}/${endpointId}`);
  runAction(endpoint.action);
}

function swiftBarPluginDirectory(): string {
  try {
    return execFileSync("/usr/bin/defaults", ["read", "com.ameba.SwiftBar", "PluginDirectory"], {
      encoding: "utf8",
    }).trim();
  } catch {
    fail(
      "dossier de plugins SwiftBar inconnu : lancez SwiftBar une fois et choisissez-le, ou passez-le en argument",
    );
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content, { mode: 0o700 });
  chmodSync(path, 0o700);
}

/**
 * Two files: a launcher in the user's config folder (a path without spaces, which SwiftBar calls
 * back on click) and the plugin in the SwiftBar folder, which only calls the launcher.
 */
function install(dir: string | undefined, interval: string): void {
  if (!/^[1-9][0-9]*[smhd]$/.test(interval))
    fail(`intervalle invalide : ${interval} (ex. 30s, 5m, 1h)`);
  const target = resolve(dir ?? swiftBarPluginDirectory());
  // SwiftBar keeps each plugin's data there, as folders it would then try to load as plugins.
  if (target.startsWith(join(homedir(), "Library", "Application Support", "SwiftBar"))) {
    fail(
      "dossier de données de SwiftBar : choisissez un dossier de plugins distinct (ex. ~/.config/swiftbar-plugins)",
    );
  }
  mkdirSync(target, { recursive: true });
  mkdirSync(storeDir(), { recursive: true, mode: 0o700 });
  const launcher = join(storeDir(), "workspace-bar");
  if (/[\s"]/.test(launcher)) fail(`chemin du lanceur non pris en charge : ${launcher}`);
  writeExecutable(
    launcher,
    `#!/bin/sh
# Généré par workspace-bar install : ${ROOT}
WORKSPACE_BAR_PLUGIN=${shellQuote(launcher)} exec ${shellQuote(process.execPath)} --disable-warning=ExperimentalWarning ${shellQuote(join(ROOT, "src", "cli.ts"))} "$@"
`,
  );
  // SwiftBar reads the refresh interval from the file name: drop a plugin installed with another one.
  for (const name of readdirSync(target)) {
    if (name.startsWith(PLUGIN_PREFIX) && name.endsWith(".sh")) rmSync(join(target, name));
  }
  const plugin = join(target, `${PLUGIN_PREFIX}${interval}.sh`);
  writeExecutable(
    plugin,
    `#!/bin/sh
# <xbar.title>Workspace Bar</xbar.title>
# <xbar.desc>Endpoints des workspaces AlignFirst</xbar.desc>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
exec ${shellQuote(launcher)} swiftbar
`,
  );
  process.stdout.write(`lanceur : ${launcher}\nplugin  : ${plugin}\n`);
}

function init(dir: string | undefined): void {
  const main = resolveMain(dir);
  const path = join(main, PROJECT_FILE);
  if (existsSync(path)) fail(`existe déjà : ${path}`);
  mkdirSync(join(main, ".local"), { recursive: true, mode: 0o700 });
  if (!isIgnoredByGit(main, PROJECT_FILE))
    fail(`${PROJECT_FILE} n'est pas ignoré par git dans ${main} : ajoutez .local/ au .gitignore`);
  if (lstatSync(join(main, ".local")).mode & 0o022)
    fail(`${join(main, ".local")} est modifiable par d'autres : chmod go-w`);
  writeFileSync(path, readFileSync(join(ROOT, "templates", "workspace-bar.json"), "utf8"), {
    mode: 0o600,
  });
  process.stdout.write(`créé : ${path}\n`);
}

async function main(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  switch (command) {
    case "add": {
      const path = resolveMain(rest[0]);
      if (!existsSync(registryDir(path)))
        process.stderr.write("attention : aucun registre AlignFirst pour l'instant\n");
      const entry = addProject(path);
      process.stdout.write(`suivi : ${entry.key} → ${entry.path}\n`);
      return;
    }
    case "remove": {
      if (!rest[0]) fail("clé ou dossier manquant");
      const removed = removeProject(rest[0]) ?? removeProject(resolve(rest[0]));
      if (!removed) fail(`non suivi : ${rest[0]}`);
      process.stdout.write(`retiré : ${removed.key}\n`);
      return;
    }
    case "list":
      for (const entry of readProjects()) process.stdout.write(`${entry.key}\t${entry.path}\n`);
      return;
    case "init":
      return init(rest[0]);
    case "json":
      process.stdout.write(`${JSON.stringify(snapshot(), null, 2)}\n`);
      return;
    case "swiftbar": {
      const plugin = process.env.WORKSPACE_BAR_PLUGIN;
      if (!plugin)
        fail("à lancer par le plugin SwiftBar (voir install), ou avec WORKSPACE_BAR_PLUGIN");
      process.stdout.write(renderSwiftBar(snapshot().projects, plugin));
      return;
    }
    case "open":
      if (rest.length !== 3) fail("usage : open <projet> <worktree> <endpoint>");
      return open(rest[0], rest[1], rest[2]);
    case "install": {
      const at = rest.indexOf("--every");
      const interval = at >= 0 ? rest[at + 1] : DEFAULT_INTERVAL;
      if (at >= 0) rest.splice(at, 2);
      return install(rest[0], interval ?? "");
    }
    default:
      process.stdout.write(USAGE);
      if (command && command !== "help" && command !== "--help") process.exit(1);
  }
}

await main(process.argv.slice(2));
