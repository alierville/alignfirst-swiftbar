# workspace-bar

Les endpoints des workspaces AlignFirst dans la barre des menus macOS, via [SwiftBar](https://github.com/swiftbar/SwiftBar).

workspace-bar se greffe sur les workspaces d'[AlignFirst](https://github.com/paleo/alignfirst) : il lit leur registre, leurs ports et leurs serveurs de dev, sans rien y modifier.

Pour chaque dépôt suivi : chaque worktree, sa branche, et ses endpoints cliquables (navigateur, TablePlus, copie, Terminal, Claude Code), avec une pastille 🟢/🔴 selon que le port écoute.

```
AlignFirst · 1
project
  🟠 main  · dev
       🟢 Console              localhost:8302
       🔴 Postgres (TablePlus) localhost:8300/app
       Super admin 🔑
       Terminal ici · Claude Code ici · Finder
```

Deux sources seulement : le registre AlignFirst (généré par AlignFirst) et un fichier JSON déclaratif par projet. Le `.env` des projets n'est jamais lu.

Node 24+ (TypeScript exécuté directement), aucune dépendance à l'exécution.

## Installation

```sh
brew install --cask swiftbar
mkdir -p ~/.config/swiftbar-plugins
defaults write com.ameba.SwiftBar PluginDirectory ~/.config/swiftbar-plugins
node src/cli.ts install          # lanceur dans ~/.config/workspace-bar, plugin dans le dossier SwiftBar
node src/cli.ts add ~/code/project
node src/cli.ts init ~/code/project   # crée .local/workspace-bar.json
```

Le dossier de plugins ne doit pas être `~/Library/Application Support/SwiftBar/…` : SwiftBar y range les données de chaque plugin dans des dossiers qu'il tenterait ensuite de charger (« Show Error »). `install` le refuse.

Après `install`, la commande est aussi disponible en `~/.config/workspace-bar/workspace-bar <commande>`. Relancer `install` après un changement de version de Node ou un déplacement du dépôt.

| Commande | Effet |
| --- | --- |
| `add <dossier>` | suit le dépôt qui contient ce dossier (son worktree principal) |
| `remove <clé\|dossier>` | ne le suit plus |
| `list` | dépôts suivis |
| `init <dossier>` | crée `.local/workspace-bar.json` depuis le modèle |
| `json` | état complet en JSON, sans aucun secret |
| `swiftbar` | menu au format SwiftBar |
| `open <projet> <worktree> <id>` | action d'un clic |

## Ce qui est lu

À chaque rafraîchissement (toutes les 10 secondes par défaut, `install --every 30s` pour changer ; « Rafraîchir » dans le menu à tout moment) :

- le registre AlignFirst du dépôt, `.local-wt/workspace-registry/` : worktrees, ports, serveurs de dev vivants (`· dev`) ;
- `git worktree list` : branches, et worktrees non provisionnés ;
- `<worktree principal>/.local/workspace-bar.json` : les endpoints à afficher ;
- `lsof` : les ports en écoute, pour les pastilles. La pastille du worktree est 🟢 si tout écoute, 🟠 en partie, 🔴 rien.

Sans fichier de projet, le menu liste les ports AlignFirst du worktree (un clic copie `localhost:port`).

## Fichier de projet

`<worktree principal>/.local/workspace-bar.json`, écrit une fois et partagé par AlignFirst avec tous les worktrees. C'est du JSON pur, jamais exécuté. Chaque chaîne peut utiliser `${ports.<nom>}` (ports AlignFirst du worktree), `${worktree}` (son chemin) et `${branch}` ; toute autre variable est une erreur. Voir `templates/workspace-bar.json`.

```json
{
  "name": "project",
  "endpoints": [
    { "label": "Console", "open": "http://localhost:${ports.console}", "port": "console" },
    { "label": "API health", "open": "http://localhost:${ports.api}/health", "port": "api" },
    { "label": "TablePlus", "open": "postgres://dev:dev@localhost:${ports.postgres}/app", "port": "postgres" },
    { "label": "Postico", "open": "postgres://dev:dev@localhost:${ports.postgres}/app", "app": "Postico" },
    { "label": "Super admin", "copy": "admin@example.local dev-password" },
    { "label": "VS Code", "run": ["/usr/local/bin/code", "${worktree}"] },
    { "label": "Terminal ici", "terminal": true },
    { "label": "Claude Code ici", "claude": true },
    { "label": "Finder", "finder": true }
  ]
}
```

Une entrée a un `label` et une seule action :

| Action | Effet |
| --- | --- |
| `open` | URL ouverte par macOS : navigateur, TablePlus pour `postgres://`… ; avec `app`, par cette application |
| `copy` | valeur copiée dans le presse-papiers, marquée 🔑 (sauf `"secret": false`) |
| `terminal`, `claude`, `finder` | Terminal, Claude Code (dans Terminal) ou Finder sur le worktree |
| `run` | exécutable en chemin absolu et ses arguments, lancé dans le worktree sans shell |

`port` (nom de port AlignFirst ou nombre) choisit le port surveillé par la pastille ; il est déduit d'une URL locale sinon. Les clés inconnues sont refusées.

Tant qu'AlignFirst n'a pas attribué de ports au worktree (`npx alignfirst dev setup` pas encore lancé), les entrées qui en utilisent un apparaissent grisées, « port non attribué » ; les autres restent cliquables. Une fois les ports attribués, un port inconnu est une erreur du fichier de projet, signalée dans le menu.

## Sécurité

- **Le menu et le JSON ne contiennent aucune valeur.** Ils n'ont que des libellés, des `hôte:port/chemin` sans identifiants, sans query ni fragment, et des ids. Un clic rappelle `open` avec des ids. L'action est recalculée à ce moment-là, et la valeur ne transite ni par SwiftBar ni par ses logs.
- **Le `.env` des projets n'est jamais lu** : aucune clé ni aucun secret de projet n'entre dans l'utilitaire. Les seules valeurs sont celles écrites dans le fichier de projet.
- **On ne copie que ce qui est déclaré** dans le fichier de projet, et ces entrées sont marquées 🔑. Le presse-papiers peut être synchronisé avec d'autres appareils et gardé par un gestionnaire d'historique : n'y mettre que des identifiants locaux de dev.
- **Pas de shell.** Les programmes (`git`, `lsof`, `open`, `pbcopy`, `osascript`) sont appelés par leur chemin absolu, avec une liste d'arguments. `run` exige un exécutable en chemin absolu. Les textes du menu sont nettoyés pour ne pas pouvoir y injecter de paramètre SwiftBar.
- **Aucun code de projet ni code tiers n'est exécuté.** Le registre et le fichier de projet sont lus en JSON, en lecture seule ; un format de registre inconnu est refusé. Il n'y a pas de `npx`, pas de dépendance, pas de réseau, et aucun port n'est ouvert.
- **Le fichier de projet décide de ce qu'un clic ouvre ou lance.** Il n'est lu que s'il remplit toutes ces conditions : il est dans le worktree principal, git l'ignore et ne le suit pas (aucun commit ne peut l'apporter), lui et son dossier ne sont pas des liens symboliques, ils t'appartiennent et ne sont modifiables par personne d'autre. Dans le cas contraire, il est ignoré et le menu l'indique.
- `~/.config/workspace-bar/` est en `0700`, la liste des projets en `0600`.

Limite : `lsof` sans `sudo` ne voit que tes processus. Ça couvre Docker Desktop, qui publie les ports sous ton compte.

## Développement

Voir [DEVELOPERS.md](DEVELOPERS.md).

## Crédits

- [AlignFirst](https://github.com/paleo/alignfirst), de Thomas Mur (Paleo), sous licence CC0 ([site](https://alignfirst.paroi.tech)) : les workspaces, leur registre et leurs serveurs de dev, sur lesquels workspace-bar s'appuie entièrement.
- [SwiftBar](https://github.com/swiftbar/SwiftBar), qui affiche le menu.

workspace-bar est un outil indépendant et non officiel : il n'est ni développé ni maintenu par l'auteur d'AlignFirst.

## Licence

MIT, voir [LICENSE](LICENSE).
