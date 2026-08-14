import { HOME, displayPath, isDir, lookup, resolve } from "./fs";

/** One piece of a rendered line. A bare string is plain output. */
export type Segment =
  | string
  | { text: string; cls?: string }
  | { text: string; href: string };

export interface Shell {
  cwd: string[];
  /** Print one line. No arguments prints a blank line. */
  line(...segments: Segment[]): void;
  /** Print a block of text, one element per newline. */
  block(text: string, cls?: string): void;
  clear(): void;
  history: readonly string[];
  /** Re-render the prompt after something changes it (cwd, theme). */
  refresh(): void;
}

export interface Command {
  summary: string;
  usage?: string;
  run(shell: Shell, args: string[]): void | Promise<void>;
}

const USER = "julian";
const HOST = "arch";

export class Terminal implements Shell {
  cwd: string[] = [...HOME];

  readonly history: string[] = [];
  private historyIndex = 0;
  /** What the visitor had typed before they started arrowing through history. */
  private draft = "";
  private busy = false;

  constructor(
    private readonly output: HTMLElement,
    private readonly promptLine: HTMLElement,
    private readonly input: HTMLInputElement,
    private readonly commands: Record<string, Command>,
    private readonly onCwdChange: (path: string) => void,
  ) {
    this.input.addEventListener("input", () => this.refresh());
    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    // Arrow keys and clicks move the caret without firing `input`.
    this.input.addEventListener("keyup", () => this.refresh());
    this.input.addEventListener("click", () => this.refresh());
    this.refresh();
  }

  // -- Shell ---------------------------------------------------------------

  line(...segments: Segment[]): void {
    const el = document.createElement("div");
    el.className = "row";
    for (const seg of segments) el.appendChild(renderSegment(seg));
    // An element with no text collapses to zero height, which would silently
    // swallow the blank lines used for spacing.
    if (el.textContent === "") el.innerHTML = "&nbsp;";
    this.output.appendChild(el);
  }

  block(text: string, cls?: string): void {
    for (const raw of text.split("\n")) {
      this.line(cls ? { text: raw, cls } : raw);
    }
  }

  clear(): void {
    this.output.replaceChildren();
  }

  refresh(): void {
    const path = displayPath(this.cwd);
    this.promptLine.replaceChildren(
      promptEl(path),
      ...caretSpans(this.input.value, this.input.selectionStart ?? this.input.value.length),
    );
    this.onCwdChange(path);
  }

  // -- Input ---------------------------------------------------------------

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  scrollToBottom(): void {
    this.output.parentElement?.scrollTo({ top: this.output.parentElement.scrollHeight });
  }

  /** Run a command as if it had been typed, echoing it at the prompt. */
  async submit(raw: string): Promise<void> {
    const path = displayPath(this.cwd);
    this.line(
      { text: `${USER}@${HOST}`, cls: "user" },
      { text: ":", cls: "dim" },
      { text: path, cls: "path" },
      { text: "$ ", cls: "dim" },
      raw,
    );

    const command = raw.trim();
    if (command) {
      // Match bash: consecutive duplicates aren't stored twice.
      if (this.history[this.history.length - 1] !== command) this.history.push(command);
      await this.run(command);
    }

    this.historyIndex = this.history.length;
    this.draft = "";
    this.input.value = "";
    this.refresh();
    this.scrollToBottom();
  }

  private async run(command: string): Promise<void> {
    const [name, ...args] = tokenize(command);
    const cmd = this.commands[name];
    if (!cmd) {
      this.line({ text: `${name}: command not found`, cls: "err" });
      this.line({ text: "Type 'help' for the list of commands.", cls: "dim" });
      return;
    }
    this.busy = true;
    try {
      await cmd.run(this, args);
    } finally {
      this.busy = false;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!this.busy) void this.submit(this.input.value);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      this.complete();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.recall(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.recall(1);
      return;
    }

    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      this.clear();
      this.refresh();
      return;
    }

    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      // Only hijack Ctrl-C when there's nothing selected to copy.
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      this.line(
        { text: `${USER}@${HOST}`, cls: "user" },
        { text: ":", cls: "dim" },
        { text: displayPath(this.cwd), cls: "path" },
        { text: "$ ", cls: "dim" },
        this.input.value,
        { text: "^C", cls: "dim" },
      );
      this.input.value = "";
      this.historyIndex = this.history.length;
      this.refresh();
      this.scrollToBottom();
      return;
    }

    if (e.ctrlKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      this.input.value = "";
      this.refresh();
    }
  }

  private recall(direction: -1 | 1): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === this.history.length) this.draft = this.input.value;

    const next = this.historyIndex + direction;
    if (next < 0 || next > this.history.length) return;

    this.historyIndex = next;
    this.input.value = next === this.history.length ? this.draft : this.history[next];
    // Park the caret at the end, the way readline does.
    this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    this.refresh();
  }

  private complete(): void {
    const value = this.input.value;
    const caret = this.input.selectionStart ?? value.length;
    const before = value.slice(0, caret);

    // Complete command names for the first word, paths for everything after.
    const start = before.lastIndexOf(" ") + 1;
    const word = before.slice(start);
    const isFirstWord = before.trim().indexOf(" ") === -1;

    const candidates = isFirstWord
      ? Object.keys(this.commands).filter((n) => n.startsWith(word)).sort()
      : this.completePath(word);

    if (candidates.length === 0) return;

    if (candidates.length === 1) {
      const completed = candidates[0] + (candidates[0].endsWith("/") ? "" : " ");
      this.input.value = value.slice(0, start) + completed + value.slice(caret);
      const pos = start + completed.length;
      this.input.setSelectionRange(pos, pos);
      this.refresh();
      return;
    }

    const shared = commonPrefix(candidates);
    if (shared.length > word.length) {
      this.input.value = value.slice(0, start) + shared + value.slice(caret);
      const pos = start + shared.length;
      this.input.setSelectionRange(pos, pos);
    } else {
      // Ambiguous: show the options, the way bash does on a second Tab.
      this.line(
        { text: `${USER}@${HOST}`, cls: "user" },
        { text: ":", cls: "dim" },
        { text: displayPath(this.cwd), cls: "path" },
        { text: "$ ", cls: "dim" },
        value,
      );
      this.line(candidates.join("  "));
      this.scrollToBottom();
    }
    this.refresh();
  }

  private completePath(word: string): string[] {
    // Split into the directory being listed and the fragment being matched.
    const slash = word.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
    const fragment = slash === -1 ? word : word.slice(slash + 1);

    const target = lookup(resolve(this.cwd, dirPart || "."));
    if (!target || !isDir(target)) return [];

    return Object.entries(target.children)
      .filter(([name]) => name.startsWith(fragment) && (fragment.startsWith(".") || !name.startsWith(".")))
      .map(([name, node]) => dirPart + name + (isDir(node) ? "/" : ""))
      .sort();
  }
}

function renderSegment(seg: Segment): globalThis.Node {
  if (typeof seg === "string") return document.createTextNode(seg);

  if ("href" in seg) {
    const a = document.createElement("a");
    a.href = seg.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = seg.text;
    return a;
  }

  const span = document.createElement("span");
  if (seg.cls) span.className = seg.cls;
  span.textContent = seg.text;
  return span;
}

function promptEl(path: string): globalThis.Node {
  const frag = document.createDocumentFragment();
  frag.appendChild(renderSegment({ text: `${USER}@${HOST}`, cls: "user" }));
  frag.appendChild(renderSegment({ text: ":", cls: "dim" }));
  frag.appendChild(renderSegment({ text: path, cls: "path" }));
  frag.appendChild(renderSegment({ text: "$ ", cls: "dim" }));
  return frag;
}

/**
 * Split the typed text around the caret so a block cursor can be drawn over
 * the character it sits on -- a real <input> caret is a thin line, and the
 * whole point here is the chunky terminal block.
 */
function caretSpans(value: string, caret: number): globalThis.Node[] {
  const before = document.createTextNode(value.slice(0, caret));
  const under = value.slice(caret, caret + 1) || " ";
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  cursor.textContent = under;
  const after = document.createTextNode(value.slice(caret + 1));
  return [before, cursor, after];
}

/** Split on whitespace, honouring single and double quotes. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function commonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
