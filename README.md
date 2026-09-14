# Puzzle Solver 2D V5

Assistant intelligent de résolution de puzzles physiques à partir de photos.

## Architecture

```
PHOTO → COMPUTER VISION → GÉOMÉTRIE → FEATURES → MATCHING → GROUPES → RECONSTRUCTION
                              ↑
                     VISION IA (optionnelle)
```

L’IA est un module d’assistance. Si elle est indisponible, le moteur géométrique continue de fonctionner.

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind CSS
- Canvas / pipeline CV maison (interface compatible OpenCV.js)
- Supabase (schéma + RLS) — optionnel au runtime (stockage local Indexed via `localStorage`)
- APIs serveur pour l’IA (`OPENAI_API_KEY` / `AI_API_KEY` jamais exposées au client)
- PWA (manifest)

## Démarrage

```bash
npm install
cp .env.example .env.local
npm run dev
```

Tests :

```bash
npm test
npm run build
```

## Moteurs

| Classe | Rôle |
|--------|------|
| `PuzzleImageProcessor` | Chargement / rotation / ImageData |
| `PuzzlePieceDetector` | Segmentation + numérotation P001… |
| `PuzzlePieceAnalyzer` | Géométrie, couleurs, textures, côtés |
| `PuzzleMatchingEngine` | Candidats filtrés + score 0–100 |
| `PuzzleGroupEngine` | GROUP001… + merge pièce/groupe |
| `PuzzleReconstructionEngine` | Placements canvas |
| `PuzzleProgressEngine` | Progression multi-facteurs |
| `PuzzleReferenceAnalyzer` | Zones référence (IA ou heuristique) |
| `PuzzleAIAssistant` | « Que faire maintenant ? » sur données réelles |

## Phases

Voir `docs/MIGRATION_PLAN.md`.

## Supabase

Appliquer `supabase/migrations/20260326000000_init_puzzle_solver.sql`.
Sans credentials, l’app fonctionne en local-first.
