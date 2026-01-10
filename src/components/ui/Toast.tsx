"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";

type ToastVariant = "error" | "warning" | "success";

export function Toast(props: {
  message: string | null | undefined;
  variant?: ToastVariant;
  onClose?: () => void;
  autoHideMs?: number;
  className?: string;
}) {
  const { message, variant = "error", onClose, autoHideMs = 0, className } = props;
  const open = !!message;

  useEffect(() => {
    if (!open) return;
    if (!onClose) return;
    if (!autoHideMs) return;
    const id = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(id);
  }, [open, onClose, autoHideMs]);

  if (!open) return null;

  const tone =
    variant === "success"
      ? {
          border: "border-emerald-200",
          bg: "bg-emerald-50",
          text: "text-emerald-800",
          title: "Success",
        }
      : variant === "warning"
        ? {
            border: "border-[rgb(var(--warning))]/30",
            bg: "bg-[rgb(var(--warning-bg))]",
            text: "text-[rgb(var(--warning))]",
            title: "Notice",
          }
        : {
            border: "border-[rgb(var(--danger))]/30",
            bg: "bg-[rgb(var(--danger-bg))]",
            text: "text-[rgb(var(--danger))]",
            title: "Error",
          };

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-1/2 z-50 flex -translate-y-1/2 justify-center px-4",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md rounded-2xl border p-4 shadow-lg",
          tone.border,
          tone.bg,
          tone.text,
        )}
        role="alert"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="font-semibold">{tone.title}</div>
          {onClose ? (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-semibold opacity-80 hover:opacity-100"
              onClick={onClose}
              aria-label="Dismiss message"
            >
              Close
            </button>
          ) : null}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm">{message}</div>
      </div>
    </div>
  );
}


