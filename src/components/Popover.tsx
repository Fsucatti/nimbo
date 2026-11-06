/** A button that opens a small panel. Closes on Escape, on a click outside, and returns focus. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface Props {
  label: string;
  /** Contents of the trigger button. */
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "start" | "end";
  onOpenChange?: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
}

export function Popover({ label, trigger, triggerClassName = "button icon-button", align = "end", onOpenChange, children }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Move focus into the panel so keyboard users land on its first control.
    const first = panel.current?.querySelector<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])");
    first?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="popover" ref={root}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div ref={panel} id={id} className={`popover-panel popover-${align}`} role="dialog" aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
