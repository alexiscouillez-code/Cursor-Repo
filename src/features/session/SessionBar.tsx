"use client";

import { useState } from "react";
import type { UserSession } from "@/types/puzzle";
import { PrimaryButton } from "@/components/ui/Sheet";

export function SessionBar({
  sessions,
  active,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  sessions: UserSession[];
  active: UserSession | null;
  onSelect: (sessionId: string) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (sessionId: string, name: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(active?.name ?? "");

  return (
    <section className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#12151a] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Session personnelle
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Tes puzzles restent sur cet appareil, séparés par profil.
          </p>
        </div>
        {active && (
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: active.color }}
            title={active.name}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session.id)}
            className={`min-h-11 rounded-xl border px-3 text-sm ${
              active?.id === session.id
                ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                : "border-white/10 bg-black/30 text-zinc-300"
            }`}
          >
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: session.color }}
            />
            {session.name}
          </button>
        ))}
      </div>

      {active && (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/40"
              />
              <PrimaryButton
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onRename(active.id, editName)
                    .then(() => setEditing(false))
                    .finally(() => setBusy(false));
                }}
              >
                OK
              </PrimaryButton>
            </>
          ) : (
            <PrimaryButton
              variant="ghost"
              onClick={() => {
                setEditName(active.name);
                setEditing(true);
              }}
            >
              Renommer
            </PrimaryButton>
          )}
          {sessions.length > 1 && (
            <PrimaryButton
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    `Supprimer la session « ${active.name} » et ses puzzles ?`,
                  )
                ) {
                  return;
                }
                setBusy(true);
                void onDelete(active.id).finally(() => setBusy(false));
              }}
            >
              Supprimer
            </PrimaryButton>
          )}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim() || "Nouvelle session";
          setBusy(true);
          void onCreate(name)
            .then(() => setNewName(""))
            .finally(() => setBusy(false));
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle session (ex. Alex)"
          className="min-h-11 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-500/40"
        />
        <PrimaryButton disabled={busy} type="submit">
          Créer
        </PrimaryButton>
      </form>
    </section>
  );
}
