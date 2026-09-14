import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PuzzleProject } from "@/types/puzzle";

const DB_NAME = "puzzle-solver-v5";
const DB_VERSION = 1;
const LEGACY_KEY = "puzzle-solver-v5-projects";

interface PuzzleDB extends DBSchema {
  projects: {
    key: string;
    value: PuzzleProject;
    indexes: { "by-updated": number };
  };
  meta: {
    key: string;
    value: { migratedFromLocalStorage?: boolean };
  };
}

let dbPromise: Promise<IDBPDatabase<PuzzleDB>> | null = null;

function getDb(): Promise<IDBPDatabase<PuzzleDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PuzzleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("by-updated", "updatedAt");
        db.createObjectStore("meta");
      },
    });
  }
  return dbPromise;
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
  // Already small enough (~ < 400KB)
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
      // Drop heavy contour samples in storage if huge
      geometry: {
        ...piece.geometry,
        contour:
          piece.geometry.contour.length > 120
            ? piece.geometry.contour.filter(
                (_, i) => i % Math.ceil(piece.geometry.contour.length / 120) === 0,
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
      // Keep minimal undo snapshot (ids + connections only)
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

export async function listProjects(): Promise<PuzzleProject[]> {
  if (typeof window === "undefined") return [];
  const db = await getDb();
  await migrateFromLocalStorageIfNeeded(db);
  const all = await db.getAll("projects");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<PuzzleProject | null> {
  if (typeof window === "undefined") return null;
  const db = await getDb();
  await migrateFromLocalStorageIfNeeded(db);
  return (await db.get("projects", id)) ?? null;
}

export async function saveProject(project: PuzzleProject): Promise<void> {
  if (typeof window === "undefined") return;
  const db = await getDb();
  const prepared = await prepareProjectForStorage(project);
  try {
    await db.put("projects", prepared);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    // Last-resort: drop full-resolution scan/reference images
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
      // Saved with reduced payload — surface soft warning via thrown message
      // that callers can display without losing the session.
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

  await db.put("meta", { migratedFromLocalStorage: true }, "migration");
}
