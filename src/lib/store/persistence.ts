import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PuzzleProject, UserSession } from "@/types/puzzle";

const DB_NAME = "puzzle-solver-v5";
const DB_VERSION = 2;
const LEGACY_KEY = "puzzle-solver-v5-projects";
const DEFAULT_SESSION_NAME = "Moi";

const SESSION_COLORS = [
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#60a5fa",
];

interface PuzzleDB extends DBSchema {
  projects: {
    key: string;
    value: PuzzleProject;
    indexes: { "by-updated": number; "by-session": string };
  };
  sessions: {
    key: string;
    value: UserSession;
  };
  meta: {
    key: string;
    value: {
      migratedFromLocalStorage?: boolean;
      sessionsBootstrapped?: boolean;
      activeSessionId?: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PuzzleDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PuzzleDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PuzzleDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("projects", { keyPath: "id" });
          store.createIndex("by-updated", "updatedAt");
          db.createObjectStore("meta");
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("sessions")) {
            db.createObjectStore("sessions", { keyPath: "id" });
          }
          const projects = transaction.objectStore("projects");
          if (!projects.indexNames.contains("by-session")) {
            projects.createIndex("by-session", "sessionId");
          }
        }
      },
    });
  }
  return dbPromise;
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; message?: string; code?: number };
  return (
    e.name === "QuotaExceededError" ||
    e.code === 22 ||
    /quota/i.test(e.message ?? "")
  );
}

/** Compress a data URL for durable storage. */
export async function compressDataUrl(
  dataUrl: string,
  maxSide = 1280,
  quality = 0.72,
): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  if (dataUrl.length < 400_000) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Prepare project for persistence: compress images, trim heavy history payloads. */
export async function prepareProjectForStorage(
  project: PuzzleProject,
): Promise<PuzzleProject> {
  const scans = await Promise.all(
    project.scans.map(async (scan) => ({
      ...scan,
      imageDataUrl: await compressDataUrl(scan.imageDataUrl, 1100, 0.68),
    })),
  );

  const pieces = await Promise.all(
    project.pieces.map(async (piece) => ({
      ...piece,
      thumbnailDataUrl: piece.thumbnailDataUrl
        ? await compressDataUrl(piece.thumbnailDataUrl, 160, 0.65)
        : piece.thumbnailDataUrl,
      geometry: {
        ...piece.geometry,
        contour:
          piece.geometry.contour.length > 120
            ? piece.geometry.contour.filter(
                (_, i) =>
                  i % Math.ceil(piece.geometry.contour.length / 120) === 0,
              )
            : piece.geometry.contour,
      },
    })),
  );

  const referenceImageDataUrl = project.referenceImageDataUrl
    ? await compressDataUrl(project.referenceImageDataUrl, 1000, 0.7)
    : undefined;

  const history = project.history.slice(0, 80).map((entry) => {
    if (entry.type === "match_confirmed" || entry.type === "group_created") {
      const previousGroups = entry.payload.previousGroups;
      if (Array.isArray(previousGroups)) {
        return {
          ...entry,
          payload: {
            matchId: entry.payload.matchId,
            groupId: entry.payload.groupId,
            previousGroups: previousGroups.map(
              (g: {
                id: string;
                code: string;
                pieceIds: string[];
                connections: unknown;
                confidence: number;
              }) => ({
                id: g.id,
                code: g.code,
                pieceIds: g.pieceIds,
                connections: g.connections,
                confidence: g.confidence,
                puzzleId: project.id,
                origin: { x: 0, y: 0 },
                orientation: 0,
                boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
              }),
            ),
          },
        };
      }
    }
    return entry;
  });

  return {
    ...project,
    scans,
    pieces,
    referenceImageDataUrl,
    history,
    updatedAt: Date.now(),
  };
}

async function ensureSessionsBootstrapped(
  db: IDBPDatabase<PuzzleDB>,
): Promise<UserSession> {
  await migrateFromLocalStorageIfNeeded(db);
  const meta = (await db.get("meta", "migration")) ?? {};
  if (meta.sessionsBootstrapped && meta.activeSessionId) {
    const existing = await db.get("sessions", meta.activeSessionId);
    if (existing) return existing;
  }

  let session = (await db.getAll("sessions"))[0];
  if (!session) {
    const now = Date.now();
    session = {
      id: cryptoId(),
      name: DEFAULT_SESSION_NAME,
      createdAt: now,
      updatedAt: now,
      color: SESSION_COLORS[0]!,
    };
    await db.put("sessions", session);
  }

  const projects = await db.getAll("projects");
  for (const project of projects) {
    if (!project.sessionId) {
      await db.put("projects", { ...project, sessionId: session.id });
    }
  }

  await db.put(
    "meta",
    {
      ...meta,
      sessionsBootstrapped: true,
      activeSessionId: session.id,
      migratedFromLocalStorage: true,
    },
    "migration",
  );
  return session;
}

export async function listSessions(): Promise<UserSession[]> {
  if (typeof window === "undefined") return [];
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const all = await db.getAll("sessions");
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getActiveSession(): Promise<UserSession> {
  const db = await getDb();
  const session = await ensureSessionsBootstrapped(db);
  const meta = (await db.get("meta", "migration")) ?? {};
  if (meta.activeSessionId) {
    const active = await db.get("sessions", meta.activeSessionId);
    if (active) return active;
  }
  return session;
}

export async function setActiveSessionId(sessionId: string): Promise<void> {
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const session = await db.get("sessions", sessionId);
  if (!session) throw new Error("Session introuvable");
  const meta = (await db.get("meta", "migration")) ?? {};
  await db.put(
    "meta",
    { ...meta, activeSessionId: sessionId, sessionsBootstrapped: true },
    "migration",
  );
}

export async function createSession(name: string): Promise<UserSession> {
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const count = (await db.getAll("sessions")).length;
  const now = Date.now();
  const session: UserSession = {
    id: cryptoId(),
    name: name.trim() || `Session ${count + 1}`,
    createdAt: now,
    updatedAt: now,
    color: SESSION_COLORS[count % SESSION_COLORS.length]!,
  };
  await db.put("sessions", session);
  await setActiveSessionId(session.id);
  return session;
}

export async function renameSession(
  sessionId: string,
  name: string,
): Promise<UserSession> {
  const db = await getDb();
  const session = await db.get("sessions", sessionId);
  if (!session) throw new Error("Session introuvable");
  const next = {
    ...session,
    name: name.trim() || session.name,
    updatedAt: Date.now(),
  };
  await db.put("sessions", next);
  return next;
}

export async function deleteSession(sessionId: string): Promise<UserSession> {
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const sessions = await db.getAll("sessions");
  if (sessions.length <= 1) {
    throw new Error("Impossible de supprimer la dernière session");
  }
  const remaining = sessions.filter((s) => s.id !== sessionId);
  const fallback = remaining[0]!;

  const projects = await db.getAll("projects");
  for (const project of projects) {
    if (project.sessionId === sessionId) {
      await db.delete("projects", project.id);
    }
  }
  await db.delete("sessions", sessionId);

  const meta = (await db.get("meta", "migration")) ?? {};
  const active =
    meta.activeSessionId === sessionId ? fallback.id : meta.activeSessionId;
  await db.put(
    "meta",
    { ...meta, activeSessionId: active, sessionsBootstrapped: true },
    "migration",
  );
  return fallback;
}

export async function listProjects(
  sessionId?: string,
): Promise<PuzzleProject[]> {
  if (typeof window === "undefined") return [];
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const active = sessionId ?? (await getActiveSession()).id;
  const all = await db.getAll("projects");
  return all
    .filter((p) => (p.sessionId ?? active) === active)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<PuzzleProject | null> {
  if (typeof window === "undefined") return null;
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  return (await db.get("projects", id)) ?? null;
}

export async function saveProject(project: PuzzleProject): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDb();
  await ensureSessionsBootstrapped(db);
  const sessionId = project.sessionId ?? (await getActiveSession()).id;
  const prepared = await prepareProjectForStorage({ ...project, sessionId });
  try {
    await db.put("projects", prepared);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    const slim: PuzzleProject = {
      ...prepared,
      scans: prepared.scans.map((s) => ({
        ...s,
        imageDataUrl: "",
      })),
      referenceImageDataUrl: undefined,
    };
    try {
      await db.put("projects", slim);
      const soft = new Error(
        "Espace presque plein : photos originales allégées. Supprime d'anciens projets si besoin.",
      );
      soft.name = "StorageSoftQuotaWarning";
      throw soft;
    } catch (inner) {
      if (inner instanceof Error && inner.name === "StorageSoftQuotaWarning") {
        throw inner;
      }
      if (isQuotaError(inner)) {
        throw new Error(
          "Quota de stockage dépassé. Supprime d'anciens puzzles puis réessaie.",
        );
      }
      throw inner;
    }
  }
}

export async function deleteProject(id: string): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDb();
  await db.delete("projects", id);
}

async function migrateFromLocalStorageIfNeeded(
  db: IDBPDatabase<PuzzleDB>,
): Promise<void> {
  const meta = await db.get("meta", "migration");
  if (meta?.migratedFromLocalStorage) return;

  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const projects = JSON.parse(raw) as PuzzleProject[];
      const tx = db.transaction("projects", "readwrite");
      for (const project of projects) {
        await tx.store.put(project);
      }
      await tx.done;
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // ignore corrupt legacy data
  }

  await db.put(
    "meta",
    { ...(meta ?? {}), migratedFromLocalStorage: true },
    "migration",
  );
}
