import Image from "next/image";
import { cx } from "../ui/cx";
import mark from "./singoda-mark.png";

/**
 * The mark: the Singoda AI dot-matrix sphere, cropped from the brand lockup in
 * brand-assets/. Transparent background so it sits on any surface.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      className={cx("size-5 shrink-0", className)}
    />
  );
}

/** Mark + name, 15px semibold sans. Used in the sidebar and the marketing header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="text-[0.9375rem] leading-none font-semibold tracking-[-0.01em]">
        Singoda AI
      </span>
    </span>
  );
}
