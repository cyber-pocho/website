import { PORTRAIT_SMALL } from "./ascii";
import {
  Dir,
  Node,
  displayPath,
  isDir,
  lookup,
  resolve,
  sizeOf,
} from "./fs";
import type { Command, Shell } from "./terminal";
import { currentTheme, setTheme, toggleTheme } from "./theme";

/** Every file gets the same plausible mtime; nothing here actually changes. */
const MTIME = "Aug 14 10:43";

function notFound(shell: Shell, cmd: string, path: string): void {
  shell.line({ text: `${cmd}: ${path}: No such file or directory`, cls: "err" });
}

function entriesOf(node: Dir, all: boolean): [string, Node][] {
  return Object.entries(node.children)
    .filter(([name]) => all || !name.startsWith("."))
    .sort(([a], [b]) => a.localeCompare(b));
}

/** Decorate a name the way `ls -F` does, so type is visible without colour. */
function decorate(name: string, node: Node): string {
  if (isDir(node)) return `${name}/`;
  if (node.kind === "link") return `${name}@`;
  return name;
}

const ls: Command = {
  summary: "list directory contents",
  usage: "ls [-l] [-a] [path]",
  run(shell, args) {
    const flags = args.filter((a) => a.startsWith("-"));
    const paths = args.filter((a) => !a.startsWith("-"));
    const long = flags.some((f) => f.includes("l"));
    const all = flags.some((f) => f.includes("a"));

    const target = paths[0] ?? ".";
    const node = lookup(resolve(shell.cwd, target));
    if (!node) return notFound(shell, "ls", target);

    if (!isDir(node)) {
      shell.line(decorate(target, node));
      return;
    }

    const entries = entriesOf(node, all);
    if (entries.length === 0) return;

    if (!long) {
      shell.line(
        ...entries.flatMap(([name, child], i) => [
          i > 0 ? "  " : "",
          { text: decorate(name, child), cls: isDir(child) ? "dir" : "" },
        ]),
      );
      return;
    }

    const width = Math.max(...entries.map(([, c]) => String(sizeOf(c)).length));
    shell.line({ text: `total ${entries.length}`, cls: "dim" });
    for (const [name, child] of entries) {
      const mode = isDir(child) ? "drwxr-xr-x" : child.kind === "link" ? "lrwxrwxrwx" : "-rw-r--r--";
      shell.line(
        { text: `${mode}  julian julian `, cls: "dim" },
        { text: String(sizeOf(child)).padStart(width), cls: "dim" },
        { text: `  ${MTIME}  `, cls: "dim" },
        { text: decorate(name, child), cls: isDir(child) ? "dir" : "" },
        ...(child.kind === "link" ? [{ text: ` -> ${child.url}`, cls: "dim" }] : []),
      );
    }
  },
};

const cd: Command = {
  summary: "change the working directory",
  usage: "cd [path]",
  run(shell, args) {
    const target = args[0] ?? "~";
    const path = resolve(shell.cwd, target);
    const node = lookup(path);
    if (!node) return notFound(shell, "cd", target);
    if (!isDir(node)) {
      shell.line({ text: `cd: ${target}: Not a directory`, cls: "err" });
      return;
    }
    shell.cwd = path;
    shell.refresh();
  },
};

const pwd: Command = {
  summary: "print the working directory",
  run(shell) {
    shell.line(`/${shell.cwd.join("/")}`);
  },
};

const cat: Command = {
  summary: "print a file",
  usage: "cat <file>",
  run(shell, args) {
    if (args.length === 0) {
      shell.line({ text: "cat: missing operand", cls: "err" });
      return;
    }
    for (const target of args) {
      const node = lookup(resolve(shell.cwd, target));
      if (!node) {
        notFound(shell, "cat", target);
        continue;
      }
      if (isDir(node)) {
        shell.line({ text: `cat: ${target}: Is a directory`, cls: "err" });
        continue;
      }
      if (node.kind === "link") {
        shell.line({ text: node.url, href: node.url });
        continue;
      }
      shell.block(node.content);
    }
  },
};

const tree: Command = {
  summary: "list the directory tree",
  usage: "tree [path]",
  run(shell, args) {
    const target = args[0] ?? ".";
    const path = resolve(shell.cwd, target);
    const node = lookup(path);
    if (!node) return notFound(shell, "tree", target);

    shell.line({ text: displayPath(path), cls: "dir" });
    let dirs = 0;
    let files = 0;

    const walk = (dir: Dir, prefix: string): void => {
      const entries = entriesOf(dir, false);
      entries.forEach(([name, child], i) => {
        const last = i === entries.length - 1;
        shell.line(
          { text: prefix + (last ? "└── " : "├── "), cls: "dim" },
          { text: decorate(name, child), cls: isDir(child) ? "dir" : "" },
        );
        if (isDir(child)) {
          dirs++;
          walk(child, prefix + (last ? "    " : "│   "));
        } else {
          files++;
        }
      });
    };

    if (isDir(node)) walk(node, "");
    shell.line();
    shell.line({ text: `${dirs} directories, ${files} files`, cls: "dim" });
  },
};

const open: Command = {
  summary: "open a .link in a new tab",
  usage: "open <file.link>",
  run(shell, args) {
    if (args.length === 0) {
      shell.line({ text: "open: missing operand", cls: "err" });
      return;
    }
    const target = args[0];
    const node = lookup(resolve(shell.cwd, target));
    if (!node) return notFound(shell, "open", target);
    if (node.kind !== "link") {
      shell.line({ text: `open: ${target}: not a link`, cls: "err" });
      return;
    }
    shell.line({ text: `Opening ${node.url}`, cls: "dim" });
    window.open(node.url, "_blank", "noopener,noreferrer");
  },
};

const theme: Command = {
  summary: "switch between the light and dark theme",
  usage: "theme [light|dark]",
  run(shell, args) {
    const want = args[0];
    if (want === "light" || want === "dark") setTheme(want);
    else if (!want) toggleTheme();
    else {
      shell.line({ text: `theme: ${want}: expected 'light' or 'dark'`, cls: "err" });
      return;
    }
    shell.line({ text: `theme -> ${currentTheme()}`, cls: "dim" });
  },
};

const help: Command = {
  summary: "show this help",
  run(shell) {
    shell.line({ text: "Available commands", cls: "bold" });
    shell.line();
    const names = Object.keys(commands).sort();
    const width = Math.max(...names.map((n) => n.length));
    for (const name of names) {
      shell.line(
        { text: `  ${name.padEnd(width)}`, cls: "bold" },
        { text: `   ${commands[name].summary}`, cls: "dim" },
      );
    }
    shell.line();
    shell.line({ text: "Tab completes, ↑/↓ walks history, Ctrl-L clears.", cls: "dim" });
    shell.line({ text: "Start with: cd about  •  cd projects  •  cd contact", cls: "dim" });
  },
};

const neofetch: Command = {
  summary: "system information",
  run(shell) {
    const title = "julian@arch";
    const info: ([string, string] | null)[] = [
      [title, ""],
      ["-".repeat(title.length), ""],
      ["user", "julian"],
      ["role", "physicist, builds AI things"],
      ["os", "Arch Linux x86_64"],
      ["shell", "bash 5.2"],
      ["wm", "Hyprland"],
      ["editor", "nvim"],
      ["langs", "Python, TypeScript, C"],
      ["topics", "maths, physics, AI, stats"],
      ["theme", currentTheme()],
    ];

    // Classic neofetch layout: logo on the left, info column beside it.
    const art = PORTRAIT_SMALL.split("\n");
    const gutter = Math.max(...art.map((l) => l.length)) + 3;
    const keyWidth = Math.max(...info.map((i) => (i ? i[0].length : 0)));
    const rows = Math.max(art.length, info.length);

    for (let i = 0; i < rows; i++) {
      const left = (art[i] ?? "").padEnd(gutter);
      const entry = info[i];
      if (!entry) {
        shell.line(left);
        continue;
      }
      // The title and its rule sit outside the key/value alignment.
      if (i < 2) {
        shell.line(left, { text: entry[0], cls: i === 0 ? "bold" : "dim" });
        continue;
      }
      shell.line(
        left,
        { text: entry[0].padEnd(keyWidth), cls: "bold" },
        { text: `  ${entry[1]}`, cls: "dim" },
      );
    }
  },
};

const whoami: Command = {
  summary: "print the current user",
  run(shell) {
    shell.line("julian");
  },
};

const echo: Command = {
  summary: "write arguments to output",
  usage: "echo [text...]",
  run(shell, args) {
    shell.line(args.join(" "));
  },
};

const date: Command = {
  summary: "print the current date and time",
  run(shell) {
    shell.line(new Date().toString());
  },
};

const history: Command = {
  summary: "show the command history",
  run(shell) {
    const width = String(shell.history.length).length;
    shell.history.forEach((entry, i) => {
      shell.line({ text: `  ${String(i + 1).padStart(width)}  `, cls: "dim" }, entry);
    });
  },
};

const clear: Command = {
  summary: "clear the screen",
  run(shell) {
    shell.clear();
  },
};

const sudo: Command = {
  summary: "execute a command as another user",
  usage: "sudo <command>",
  run(shell) {
    shell.line("julian is not in the sudoers file. This incident has been reported.");
  },
};

const exit: Command = {
  summary: "close the session",
  run(shell) {
    shell.line({ text: "There is no exit. Try 'cd contact' instead.", cls: "dim" });
  },
};

export const commands: Record<string, Command> = {
  cat,
  cd,
  clear,
  date,
  echo,
  exit,
  help,
  history,
  ls,
  neofetch,
  open,
  pwd,
  sudo,
  theme,
  tree,
  whoami,
  // `xdg-open` is what you'd actually reach for on a Linux box.
  "xdg-open": open,
};
