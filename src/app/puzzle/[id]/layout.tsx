"use client";

import { PuzzleProvider } from "@/features/puzzle/PuzzleProvider";
import { BottomNav } from "@/components/layout/BottomNav";
import type { ReactNode } from "react";
import { use } from "react";

export default function PuzzleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <PuzzleProvider puzzleId={id}>
      <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-6">
        {children}
      </div>
      <BottomNav puzzleId={id} />
    </PuzzleProvider>
  );
}
