import type { Metadata } from "next";
import { DemoPlayer } from "@/components/replay/DemoPlayer";

export const metadata: Metadata = {
  title: "Shadow in 90 seconds",
  description:
    "A 90-second replay of the whole story: Shadow learns a support lead's judgment, maps it, and stops a new hire's wrong refund before it is saved.",
};

export default function DemoPage() {
  return (
    <main>
      <DemoPlayer />
    </main>
  );
}
