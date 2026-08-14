import "./style.css";
import { commands } from "./commands";
import { Terminal } from "./terminal";
import { currentTheme, followSystemUntilOverridden, toggleTheme } from "./theme";

const screen = document.getElementById("screen") as HTMLElement;
const output = document.getElementById("output") as HTMLElement;
const promptLine = document.getElementById("prompt") as HTMLElement;
const input = document.getElementById("tty") as HTMLInputElement;
const title = document.getElementById("title") as HTMLElement;
const toggle = document.getElementById("theme-toggle") as HTMLButtonElement;

followSystemUntilOverridden();

const term = new Terminal(output, promptLine, input, commands, (path) => {
  title.textContent = `julian@arch: ${path}`;
});

// -- Boot ------------------------------------------------------------------

/** A keypress or click during boot skips the rest of the animation. */
let skipped = false;
const skip = () => {
  skipped = true;
};
addEventListener("keydown", skip, { once: true });
addEventListener("pointerdown", skip, { once: true });

const pause = (ms: number) =>
  new Promise<void>((done) => {
    if (skipped) done();
    else setTimeout(done, ms);
  });

async function boot(): Promise<void> {
  input.disabled = true;

  const banner = [
    "Arch Linux 7.0.9-arch2-1 (tty1)",
    "",
    "julian@arch login: julian",
    `Last login: ${new Date().toDateString()} on tty1`,
    "",
  ];
  for (const row of banner) {
    term.block(row, "dim");
    term.scrollToBottom();
    await pause(90);
  }

  await commands.neofetch.run(term, []);
  term.line();
  term.line({ text: "Type ", cls: "dim" }, { text: "help", cls: "bold" }, {
    text: " to get started, or cd into about/, projects/ or contact/.",
    cls: "dim",
  });
  term.line();

  input.disabled = false;
  removeEventListener("keydown", skip);
  removeEventListener("pointerdown", skip);
  term.refresh();
  term.focus();
  term.scrollToBottom();
}

void boot();

// -- Focus -----------------------------------------------------------------

// Clicking anywhere in the window returns focus to the prompt, but never
// while the visitor is selecting output text or following a link.
screen.addEventListener("pointerup", (e) => {
  if (window.getSelection()?.toString()) return;
  if ((e.target as HTMLElement).closest("a")) return;
  term.focus();
});

// -- Theme -----------------------------------------------------------------

function syncToggle(): void {
  const other = currentTheme() === "dark" ? "light" : "dark";
  toggle.setAttribute("aria-label", `Switch to ${other} theme`);
  toggle.title = `Switch to ${other} theme`;
}

toggle.addEventListener("click", () => {
  toggleTheme();
  syncToggle();
  term.focus();
});

syncToggle();
