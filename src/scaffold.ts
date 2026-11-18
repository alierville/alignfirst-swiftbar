import type { EntryDeclaration } from "./types.ts";

// What `init` writes: a project file pre-filled from the AlignFirst ports, to be edited by hand.

export const SCHEMA_URL =
  "https://raw.githubusercontent.com/alierville/alignfirst-swiftbar/main/schemas/workspace-bar.schema.json";

// Ports that are not web servers: a click copies `localhost:<port>` instead of opening a browser.
const NON_HTTP =
  /postgres|pg|mysql|maria|mongo|redis|valkey|sql|db|database|cache|queue|smtp|mail/i;

export interface InitialFile {
  $schema: string;
  name: string;
  endpoints: EntryDeclaration[];
}

/** One entry per AlignFirst port name, then Terminal, Claude Code and Finder. */
export function initialProjectFile(name: string, portNames: string[]): InitialFile {
  const ports = portNames.map((port): EntryDeclaration => {
    const address = `localhost:\${ports.${port}}`;
    return NON_HTTP.test(port)
      ? { label: port, copy: address, secret: false, port }
      : { label: port, open: `http://${address}`, port };
  });
  return {
    $schema: SCHEMA_URL,
    name,
    endpoints: [
      ...ports,
      { label: "Terminal here", terminal: true },
      { label: "Claude Code here", claude: true },
      { label: "Finder", finder: true },
    ],
  };
}
