import Image from "next/image";
import mark from "./singoda-mark.png";

/** The PNG mark filling its box: the hero sphere's loading state and its no-WebGL fallback. */
export function MarkImage() {
  return (
    <Image
      src={mark}
      alt=""
      aria-hidden="true"
      priority
      sizes="(min-width: 1024px) 352px, 160px"
      className="size-full object-contain"
    />
  );
}
