"use client";

import { useMemo, useState } from "react";
import { PuzzleAssistant } from "@/lib/analysis/PuzzleAssistant";
import type { AssistantReply, PuzzleProject } from "@/types/puzzle";
import { BottomSheet, PrimaryButton } from "@/components/ui/Sheet";

export function AssistantPanel({
  project,
  open,
  onClose,
}: {
  project: PuzzleProject;
  open: boolean;
  onClose: () => void;
}) {
  const assistant = useMemo(() => new PuzzleAssistant(), []);
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [seededForOpen, setSeededForOpen] = useState(false);

  if (open && !seededForOpen) {
    setSeededForOpen(true);
    setReply(assistant.answer(project, "Que faire maintenant ?"));
  }
  if (!open && seededForOpen) {
    setSeededForOpen(false);
  }

  const ask = (q: string) => {
    setReply(assistant.answer(project, q));
  };

  return (
    <BottomSheet open={open} title="Assistant puzzle" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-sm text-zinc-200 whitespace-pre-wrap">
          {reply?.message ?? "…"}
        </div>
        {reply?.sources && (
          <p className="text-[11px] text-zinc-500">
            Sources : {reply.sources.join(", ")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {[
            "Que faire maintenant ?",
            "Où sont les pièces du ciel ?",
            "Pourquoi ?",
            "Progression ?",
          ].map((q) => (
            <button
              key={q}
              type="button"
              className="min-h-11 rounded-lg bg-white/5 px-3 text-xs text-zinc-300"
              onClick={() => ask(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ta question…"
            className="min-h-12 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-500/50"
          />
          <PrimaryButton
            onClick={() => {
              if (!question.trim()) return;
              ask(question);
              setQuestion("");
            }}
          >
            OK
          </PrimaryButton>
        </div>
      </div>
    </BottomSheet>
  );
}

export function NextActionButton({
  project,
  onOpenAssistant,
}: {
  project: PuzzleProject;
  onOpenAssistant: () => void;
}) {
  const rec = useMemo(
    () => new PuzzleAssistant().recommendNext(project),
    [project],
  );

  return (
    <button
      type="button"
      onClick={onOpenAssistant}
      className="fixed bottom-20 right-3 z-30 max-w-[80vw] rounded-2xl border border-cyan-400/30 bg-[#0f141c]/95 px-4 py-3 text-left shadow-lg shadow-cyan-950/40 backdrop-blur"
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-400">
        Que faire maintenant ?
      </div>
      <div className="mt-1 text-sm text-white">{rec.action}</div>
    </button>
  );
}
