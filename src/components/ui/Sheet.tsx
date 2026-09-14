"use client";

import type { ReactNode } from "react";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/60 opacity-100"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] translate-y-0 overflow-auto rounded-t-2xl border border-white/10 bg-[#12151a] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-wide text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "success";
  type?: "button" | "submit" | "reset";
}) {
  const styles = {
    primary: "bg-cyan-500 text-black hover:bg-cyan-400",
    ghost: "bg-white/5 text-white hover:bg-white/10",
    danger: "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30",
    success: "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30",
  }[variant];

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 flex-1 rounded-xl px-4 text-sm font-semibold tracking-wide transition disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}

export function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className="text-cyan-200">{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
