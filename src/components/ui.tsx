/* Shared UI building blocks. */
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, Trash2, X } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-5 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        variant === "primary" && "bg-navy text-white hover:bg-navy-2",
        variant === "accent" && "bg-signal text-white hover:bg-signal-2",
        variant === "secondary" && "border border-line bg-white text-ink hover:border-ink/30",
        variant === "ghost" && "text-ink hover:bg-panel",
        variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx("inline-flex h-8 w-8 items-center justify-center rounded-full text-mute transition-colors hover:bg-panel hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent", className)} {...rest}>
      {children}
    </button>
  );
}

const inputBase =
  "w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink placeholder:text-mute/70 outline-none transition focus:border-signal focus:ring-4 focus:ring-signal/10 disabled:bg-panel";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, "h-10", className)} {...rest} />;
});

export function Textarea({ className, autoGrow = true, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoGrow || !ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
  }, [rest.value, autoGrow]);
  return <textarea ref={ref} rows={rest.rows ?? 2} className={cx(inputBase, "resize-y py-2 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, "h-10 cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className, optional }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; className?: string; optional?: boolean }) {
  const id = useId();
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {optional ? <span className="font-normal text-mute"> (optional)</span> : null}
      </label>
      {children(id)}
      {error ? <span className="text-xs text-red-600">{error}</span> : hint ? <span className="text-xs text-mute">{hint}</span> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-signal" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <span className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description ? <span className="block text-xs text-mute">{description}</span> : null}
      </span>
    </label>
  );
}

export function Card({ children, className, title, action, description }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; description?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-white", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div>
            <h2 className="text-[15px] font-bold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[13px] text-mute">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={title ? "px-5 pb-5 pt-4" : ""}>{children}</div>
    </section>
  );
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-panel text-mute",
  sent: "bg-soft text-signal-2",
  accepted: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  declined: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500 line-through",
  expired: "bg-slate-100 text-slate-500",
  overdue: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold capitalize", STATUS_STYLE[status] || STATUS_STYLE.draft)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("h-5 w-5 animate-spin text-mute", className)} aria-label="Loading" />;
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="flex h-12 w-12 items-center justify-center rounded-full bg-soft text-signal">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-sm text-sm text-mute">{children}</p> : null}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <header className="flex items-center justify-between border-b border-line-2 px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

/* Delete button that asks once, in place. */
export function ConfirmDelete({ onConfirm, label = "Delete", size = "sm", iconOnly }: { onConfirm: () => void | Promise<void>; label?: string; size?: "sm" | "md"; iconOnly?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  if (iconOnly && !armed) {
    return (
      <IconButton label={label} onClick={() => setArmed(true)} className="hover:text-red-600">
        <Trash2 className="h-4 w-4" />
      </IconButton>
    );
  }
  return (
    <Button
      variant="danger"
      size={size}
      loading={busy}
      icon={<Trash2 className="h-3.5 w-3.5" />}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? "Confirm" : iconOnly ? "" : label}
    </Button>
  );
}

/* Number input that keeps an empty value as null. */
export function NumberInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    const parsed = parseFloat(text);
    if ((value == null && text !== "" && !Number.isNaN(parsed)) || (value != null && parsed !== value)) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, "");
        if (!/^-?\d*\.?\d*$/.test(t)) return;
        setText(t);
        const n = parseFloat(t);
        onChange(t === "" || Number.isNaN(n) ? null : n);
      }}
      className={cx("tabular-nums", className)}
      {...rest}
    />
  );
}
