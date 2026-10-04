"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, KbdCombo } from "../ui";
import { cx } from "../ui/cx";
import { type Command, filterCommands, groupCommands } from "./commands";

export type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly Command[];
};

/**
 * ⌘K: a combobox over a listbox of commands. Type to filter, arrows to move, Enter to run,
 * Escape to close. Results are ranked when there is a query and grouped when there is not.
 */
export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const sections = useMemo<Array<[string, Command[]]>>(
    () => (query.trim() ? [["Results", results]] : groupCommands(results)),
    [query, results],
  );
  const flat = useMemo(() => sections.flatMap(([, list]) => list), [sections]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // The dialog opens on the next frame; focus the input once it is in the top layer.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    onOpenChange(false);
    cmd.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  let index = -1;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      hideTitle
      hideClose
      placement="top"
      size="md"
    >
      <div className="flex items-center gap-2 border-b border-rule px-3">
        <Search aria-hidden="true" className="size-4 shrink-0 stroke-[1.75] text-ink-faint" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={flat.length ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search commands"
          placeholder="Type a command or search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Commands"
        className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5"
      >
        {flat.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-ui text-ink-muted">
            No commands match “{query}”.
          </p>
        ) : (
          sections.map(([group, list]) => (
            // biome-ignore lint/a11y/useSemanticElements: an ARIA group inside a listbox; <fieldset> is not valid there
            <div key={group} role="group" aria-label={group} className="pb-1">
              <p className="px-2.5 pt-2 pb-1 text-2xs font-medium text-ink-faint">{group}</p>
              {list.map((cmd) => {
                index += 1;
                const i = index;
                const selected = i === active;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection is driven by the combobox input (aria-activedescendant)
                  <div
                    key={cmd.id}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    onPointerMove={() => setActive(i)}
                    onClick={() => run(cmd)}
                    className={cx(
                      "flex h-9 cursor-default items-center gap-3 rounded-control px-2.5 text-ui",
                      selected ? "bg-selected text-ink" : "text-ink-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className={selected ? "text-ink" : "text-ink"}>{cmd.label}</span>
                      {cmd.hint ? <span className="ml-2 text-ink-faint">{cmd.hint}</span> : null}
                    </span>
                    {cmd.shortcut ? <KbdCombo keys={cmd.shortcut} sequence={cmd.sequence} /> : null}
                    {selected ? (
                      <CornerDownLeft
                        aria-hidden="true"
                        className="size-3.5 stroke-[1.75] text-ink-faint"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-rule bg-sunken px-3 py-2 text-2xs text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <KbdCombo keys={["↑", "↓"]} /> to move
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KbdCombo keys={["↵"]} /> to run
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KbdCombo keys={["Esc"]} /> to close
        </span>
      </div>
    </Dialog>
  );
}
