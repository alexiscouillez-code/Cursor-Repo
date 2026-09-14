"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Accueil", match: (p: string) => p === "/" },
  {
    href: "scanner",
    label: "Scanner",
    match: (p: string) => p.includes("/scanner"),
  },
  {
    href: "matches",
    label: "Associations",
    match: (p: string) => p.includes("/matches"),
  },
  {
    href: "canvas",
    label: "Puzzle",
    match: (p: string) => p.includes("/canvas"),
  },
] as const;

export function BottomNav({ puzzleId }: { puzzleId?: string }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0d10]/95 backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const href =
            tab.href === "/"
              ? "/"
              : puzzleId
                ? `/puzzle/${puzzleId}/${tab.href}`
                : "/";
          const active = tab.match(pathname);
          return (
            <li key={tab.label} className="flex-1">
              <Link
                href={href}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] tracking-wide ${
                  active ? "text-cyan-300" : "text-zinc-400"
                }`}
              >
                <span
                  className={`h-1 w-6 rounded-full ${active ? "bg-cyan-400" : "bg-transparent"}`}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
