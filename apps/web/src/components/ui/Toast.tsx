"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";

export type ToastTone = "neutral" | "ok" | "danger";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before it hides; 0 keeps it until dismissed. Default 5000. */
  duration?: number;
};

type ToastItem = Required<Omit<ToastInput, "description">> & { id: number; description?: string };

type ToastApi = { toast: (t: ToastInput) => number; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

const NOOP: ToastApi = {
  toast: () => {
    console.warn("useToast() called outside <ToastProvider>; the toast was dropped.");
    return -1;
  },
  dismiss: () => {},
};

/** Fire short confirmations ("Work Map published") from anywhere under <ToastProvider>. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const ICON: Record<ToastTone, ReactNode> = {
  neutral: <Info className="text-ink-muted" />,
  ok: <CircleCheck className="text-ok" />,
  danger: <CircleAlert className="text-danger" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((t: ToastInput) => {
    seq.current += 1;
    const id = seq.current;
    setItems((prev) =>
      [
        ...prev,
        {
          id,
          title: t.title,
          description: t.description,
          tone: t.tone ?? "neutral",
          duration: t.duration ?? 5000,
        },
      ].slice(-3),
    );
    return id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(22rem,calc(100%-2rem))] flex-col gap-2"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    if (item.duration <= 0) return;
    const t = setTimeout(onDismiss, item.duration);
    return () => clearTimeout(t);
  }, [item.duration, onDismiss]);

  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-panel border border-rule bg-raised px-3 py-2.5 shadow-overlay"
    >
      <span aria-hidden="true" className="mt-0.5 [&_svg]:size-4 [&_svg]:stroke-[1.75]">
        {ICON[item.tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-ink">{item.title}</p>
        {item.description ? (
          <p className="mt-0.5 text-xs text-ink-muted">{item.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className={cx(
          "-m-1 inline-flex size-6 items-center justify-center rounded-control text-ink-faint hover:bg-hover hover:text-ink",
        )}
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
