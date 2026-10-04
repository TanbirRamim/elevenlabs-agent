import type { ReactNode } from "react";
import { cx } from "../ui/cx";

const WIDTH = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-[90rem]",
} as const;

/**
 * The <main> of an in-app page: consistent gutters (16 / 24 / 32px) and max width.
 * Put a <PageHeader> first, then the surface.
 */
export function Page({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) {
  return (
    <main className={cx("mx-auto w-full px-4 pt-6 pb-16 sm:px-6 lg:px-8", WIDTH[width], className)}>
      {children}
    </main>
  );
}
