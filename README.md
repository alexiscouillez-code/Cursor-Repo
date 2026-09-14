# Puzzle Solver 2D V5

Assistant de résolution de puzzles physiques à partir de photos.
**Moteur local uniquement** — pas d’IA générative externe.

## Architecture

```
PHOTO → COMPUTER VISION → GÉOMÉTRIE → FEATURES → MATCHING → GROUPES → RECONSTRUCTION
                ↓
     ANALYSE RÉFÉRENCE (grille couleur locale)
                ↓
         ASSISTANT MOTEUR
```

## Stack

- Next.js + React + TypeScript + Tailwind
- Canvas / CV maison
- Supabase schema optionnel
- PWA

## Démarrage

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## Moteurs

| Classe | Rôle |
|--------|------|
| `PuzzleImageProcessor` | Chargement / rotation |
| `PuzzlePieceDetector` | Segmentation + P001… |
| `PuzzlePieceAnalyzer` | Géométrie, couleurs, textures |
| `PuzzleMatchingEngine` | Candidats + score 0–100 |
| `PuzzleGroupEngine` | Groupes + undo |
| `PuzzleReconstructionEngine` | Canvas |
| `PuzzleProgressEngine` | Progression multi-facteurs |
| `PuzzleReferenceAnalyzer` | Zones image (analyse locale) |
| `PuzzleAssistant` | « Que faire maintenant ? » |

## Analyse de référence

Grille 3×3 → classification couleur (ciel / eau / forêt / sol / bâtiment / objet) → JSON structuré avec confiance. Aucune clé API.
