import Link from "next/link";

const routes = [
  { href: "/desk", label: "DeskSim", note: "Sandbox helpdesk (the screen that gets shared)" },
  { href: "/capture", label: "Capture", note: "Expert works, Shadow asks why" },
  { href: "/map/latest", label: "Work Map", note: "Steps, reasons, guardrails, screen moments" },
  { href: "/teach", label: "Teach", note: "New hire works, Shadow coaches" },
  { href: "/copilot", label: "Copilot", note: "Stretch: Work Map as an agent policy" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">Shadow</h1>
      <p className="mt-2 text-neutral-500">The AI apprentice for support escalations.</p>
      <ul className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800">
        {routes.map((r) => (
          <li key={r.href} className="py-4">
            <Link href={r.href} className="font-medium underline-offset-4 hover:underline">
              {r.label}
            </Link>
            <p className="text-sm text-neutral-500">{r.note}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
