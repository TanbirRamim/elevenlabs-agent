"use client";

import { Dialog, KbdCombo } from "../ui";
import { PRODUCT_NAV } from "./nav";

type Row = { label: string; keys: readonly string[]; sequence?: boolean };

export function shortcutGroups(modKey: string): Array<{ title: string; rows: Row[] }> {
  return [
    {
      title: "General",
      rows: [
        { label: "Open the command menu", keys: [modKey, "K"] },
        { label: "Show keyboard shortcuts", keys: ["?"] },
        { label: "Toggle the sidebar", keys: ["["] },
        { label: "Close a dialog or menu", keys: ["Esc"] },
      ],
    },
    {
      title: "Go to",
      rows: PRODUCT_NAV.filter((n) => n.goKey).map((n) => ({
        label: n.label,
        keys: ["G", (n.goKey ?? "").toUpperCase()],
        sequence: true,
      })),
    },
    {
      title: "Capture session",
      rows: [{ label: "Go off or back on the record", keys: ["Alt", "O"] }],
    },
    {
      title: "Demo replay",
      rows: [
        { label: "Play or pause", keys: ["Space"] },
        { label: "Previous or next moment", keys: ["←", "→"] },
      ],
    },
  ];
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  modKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modKey: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="lg">
      <div className="grid gap-5 sm:grid-cols-2">
        {shortcutGroups(modKey).map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-1.5 text-2xs font-medium text-ink-faint">{g.title}</h3>
            <dl className="flex flex-col">
              {g.rows.map((r) => (
                <div
                  key={r.label}
                  className="flex h-8 items-center justify-between gap-3 border-b border-rule last:border-b-0"
                >
                  <dt className="text-ui text-ink-muted">{r.label}</dt>
                  <dd>
                    <KbdCombo keys={r.keys} sequence={r.sequence} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
