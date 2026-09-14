"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHomePuzzles } from "@/features/puzzle/PuzzleProvider";
import { SessionBar } from "@/features/session/SessionBar";
import { BottomNav } from "@/components/layout/BottomNav";

export default function HomePage() {
  const {
    projects,
    sessions,
    activeSession,
    create,
    remove,
    selectSession,
    addSession,
    renameActiveSession,
    removeSession,
    storageError,
    loading,
  } = useHomePuzzles();
  const router = useRouter();
  const [name, setName] = useState("Mon puzzle");
  const [expected, setExpected] = useState(500);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-8">
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-400/90">
          Puzzle Solver 2D
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-white">
          V5
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
          Moteur géométrie → matching → groupes. Analyse locale, sans IA
          externe.
        </p>
        {activeSession && (
          <p className="mt-2 text-xs text-cyan-300/80">
            Session active : {activeSession.name}
          </p>
        )}
      </header>

      {(storageError || formError) && (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {formError ?? storageError}
        </p>
      )}

      <SessionBar
        sessions={sessions}
        active={activeSession}
        onSelect={(id) => void selectSession(id)}
        onCreate={addSession}
        onRename={renameActiveSession}
        onDelete={removeSession}
      />

      <section className="mb-8 space-y-3 rounded-2xl border border-white/10 bg-[#12151a] p-4">
        <h2 className="text-sm font-medium text-white">Nouveau puzzle</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const puzzleName =
              String(fd.get("name") ?? name).trim() || "Puzzle";
            const pieceCount = Number(fd.get("expected")) || expected || 100;
            setBusy(true);
            setFormError(null);
            void create(puzzleName, pieceCount)
              .then((p) => {
                router.push(`/puzzle/${p.id}/scanner`);
              })
              .catch((error: unknown) => {
                setFormError(
                  error instanceof Error
                    ? error.message
                    : "Impossible de créer le puzzle (stockage plein ?)",
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-xs text-zinc-400">
            Nom
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/40"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Nombre de pièces attendu
            <input
              name="expected"
              type="number"
              min={20}
              max={5000}
              value={expected}
              onChange={(e) => setExpected(Number(e.target.value) || 0)}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/40"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !activeSession}
            className="min-h-12 w-full rounded-xl bg-cyan-500 px-4 text-sm font-semibold tracking-wide text-black transition hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? "Création…" : "Créer & scanner"}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Projets {activeSession ? `· ${activeSession.name}` : ""}
        </h2>
        {loading && <p className="text-sm text-zinc-500">Chargement…</p>}
        {!loading && projects.length === 0 && (
          <p className="text-sm text-zinc-500">
            Aucun puzzle dans cette session.
          </p>
        )}
        {projects.map((p) => (
          <article
            key={p.id}
            className="rounded-2xl border border-white/10 bg-[#12151a] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base text-white">{p.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.pieces.length}/{p.expectedPieces} pièces ·{" "}
                  {p.progress.piecesAssembled ?? 0} assemblées ·{" "}
                  {p.progress.estimatedPercent}% · {p.groups.length} groupes
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-zinc-500"
                onClick={() => void remove(p.id)}
              >
                Suppr.
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/puzzle/${p.id}/scanner`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-cyan-500/15 text-sm text-cyan-200"
              >
                Ouvrir
              </Link>
              <Link
                href={`/puzzle/${p.id}/matches`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-white/5 text-sm text-zinc-300"
              >
                Associations
              </Link>
            </div>
          </article>
        ))}
      </section>

      <BottomNav />
    </main>
  );
}
