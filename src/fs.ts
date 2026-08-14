import { PORTRAIT } from "./ascii";

export type Node = Dir | FileNode | LinkNode;

export interface Dir {
  kind: "dir";
  children: Record<string, Node>;
}

export interface FileNode {
  kind: "file";
  content: string;
}

/** A .link file: `cat` prints the URL, `open` follows it. */
export interface LinkNode {
  kind: "link";
  url: string;
  label: string;
}

const dir = (children: Record<string, Node>): Dir => ({ kind: "dir", children });
const file = (content: string): FileNode => ({ kind: "file", content: content.trim() });
const link = (label: string, url: string): LinkNode => ({ kind: "link", url, label });

export const HOME = ["home", "julian"];

export const root: Dir = dir({
  home: dir({
    julian: dir({
      ".bashrc": file(`
# ~/.bashrc

export EDITOR=nvim
export BROWSER=firefox

alias please='sudo'
alias ll='ls -l'

# "There are only two hard things in Computer Science:
#  cache invalidation and naming things."  -- Phil Karlton
`),

      "about": dir({
        "whoami.txt": file(`
Hey! I'm Julian and I love solving problems (by trade, I'm a
physicist).

I also love AI and talking endlessly about history (shoot me an
email if you want to go on a tangent about how Napoleon is the
most important figure since Christ).

I also build AI stuff. Did I already say that I love AI?! I love
AI. No cringe intended. Okay. Perhaps I did.
`),

        "interests.txt": file(`
  Mathematics
  Physics
  Computer Science
  Probability & Statistics
  Artificial Intelligence
  History (ask me about Napoleon)
`),

        "portrait.txt": file(PORTRAIT),
      }),

      "projects": dir({
        "README.md": file(`
# Stuff I did

Nothing here yet.

This directory is populated from PROJECTS.md in the repository
root. Drop that file in and the projects will show up here, one
entry per project.

  $ cat ~/projects/README.md   # you are here
`),
      }),

      "contact": dir({
        "x.link": link("x", "https://x.com/julian_in_orbit"),
        "linkedin.link": link("linkedin", "https://linkedin.com/in/jualfonsog"),
        "github.link": link("github", "https://github.com/cyber-pocho"),
      }),
    }),
  }),
});

export function isDir(node: Node): node is Dir {
  return node.kind === "dir";
}

/** Absolute path segments -> node, or null if nothing is there. */
export function lookup(path: string[]): Node | null {
  let node: Node = root;
  for (const seg of path) {
    if (!isDir(node)) return null;
    const next: Node | undefined = node.children[seg];
    if (!next) return null;
    node = next;
  }
  return node;
}

/**
 * Resolve a user-typed path against `cwd` into absolute segments.
 * Handles `~`, absolute paths, `.` and `..`. Does not check existence.
 */
export function resolve(cwd: string[], input: string): string[] {
  let segments: string[];
  if (input === "~" || input.startsWith("~/")) {
    segments = [...HOME, ...input.slice(1).split("/")];
  } else if (input.startsWith("/")) {
    segments = input.split("/");
  } else {
    segments = [...cwd, ...input.split("/")];
  }

  const out: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out;
}

/** Absolute segments -> display string, abbreviating $HOME as `~`. */
export function displayPath(path: string[]): string {
  if (path.length >= HOME.length && HOME.every((s, i) => path[i] === s)) {
    const rest = path.slice(HOME.length);
    return rest.length ? `~/${rest.join("/")}` : "~";
  }
  return `/${path.join("/")}`;
}

/** Byte size shown by `ls -l`. Directories get the traditional 4096. */
export function sizeOf(node: Node): number {
  if (node.kind === "dir") return 4096;
  if (node.kind === "link") return node.url.length;
  return node.content.length + 1;
}
