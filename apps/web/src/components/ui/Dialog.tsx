"use client";

import { X } from "lucide-react";
import { type MouseEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "./Button";
import { cx } from "./cx";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: the dialog's accessible name. Hide it visually with `hideTitle`. */
  title: ReactNode;
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned action row (secondary, then primary). */
  footer?: ReactNode;
  className?: string;
  /** Hide the close button (the palette closes on Escape and backdrop instead). */
  hideClose?: boolean;
};

/**
 * Opens a native <dialog> as a modal: the browser handles the focus trap, inert background,
 * top layer and Escape. Exported for Sheet and the command palette.
 */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);
  return ref;
}

function closeOnBackdrop(e: MouseEvent<HTMLDialogElement>, onOpenChange: (o: boolean) => void) {
  // A click whose target is the <dialog> itself landed on the backdrop, not the content.
  if (e.target === e.currentTarget) onOpenChange(false);
}

export type DialogProps = BaseProps & {
  size?: "sm" | "md" | "lg";
  /** `top` pins the dialog high on the screen (command palette); `center` for confirmations. */
  placement?: "center" | "top";
};

const WIDTH = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function Dialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  className,
  hideClose = false,
  size = "md",
  placement = "center",
}: DialogProps) {
  const ref = useModal(open);
  const titleId = useId();
  const descId = useId();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively by <dialog>; the click only closes on backdrop
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={() => onOpenChange(false)}
      onClick={(e) => closeOnBackdrop(e, onOpenChange)}
      className={cx(
        "w-[calc(100%-2rem)] overflow-visible bg-transparent p-0 text-ink backdrop:animate-fade-in",
        placement === "top" ? "mx-auto mt-[12vh] mb-auto" : "m-auto",
        WIDTH[size],
      )}
    >
      {open ? (
        <div
          className={cx(
            "flex max-h-[80vh] animate-pop-in flex-col overflow-hidden rounded-overlay border border-rule bg-raised shadow-overlay",
            className,
          )}
        >
          <div className={cx("flex items-start gap-3 px-4 pt-4", hideTitle && "sr-only")}>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-sm font-semibold text-ink">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-ui text-ink-muted">
                  {description}
                </p>
              ) : null}
            </div>
            {hideClose ? null : (
              <IconButton
                label="Close"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="-mt-1 -mr-1"
              >
                <X />
              </IconButton>
            )}
          </div>
          <div className={cx("min-h-0 flex-1 overflow-y-auto", !hideTitle && "px-4 pt-3 pb-4")}>
            {children}
          </div>
          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule bg-sunken px-4 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

export type SheetProps = BaseProps & { side?: "left" | "right"; width?: string };

/** A full-height panel from the edge: mobile navigation, a ticket's details. */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  className,
  hideClose = false,
  side = "left",
  width = "w-72",
}: SheetProps) {
  const ref = useModal(open);
  const titleId = useId();
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled natively by <dialog>; the click only closes on backdrop
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
      onClick={(e) => closeOnBackdrop(e, onOpenChange)}
      className={cx(
        "m-0 h-dvh max-h-dvh max-w-[calc(100%-3rem)] bg-transparent p-0 text-ink",
        side === "left" ? "mr-auto" : "ml-auto",
        width,
      )}
    >
      {open ? (
        <div
          className={cx(
            "flex h-full flex-col border-rule bg-canvas",
            side === "left" ? "animate-slide-in-left border-r" : "border-l",
            className,
          )}
        >
          <div
            className={cx(
              "flex items-center gap-3 border-b border-rule px-3 py-2",
              hideTitle && "sr-only",
            )}
          >
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-ui font-semibold">
              {title}
            </h2>
            {hideClose ? null : (
              <IconButton label="Close" size="sm" onClick={() => onOpenChange(false)}>
                <X />
              </IconButton>
            )}
          </div>
          {description ? <p className="px-3 pt-2 text-ui text-ink-muted">{description}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-rule px-3 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
