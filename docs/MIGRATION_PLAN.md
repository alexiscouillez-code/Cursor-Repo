# Plan de migration Puzzle Solver 2D → V5

## Audit initial (2026-03-26)

Repository `Cursor-Repo` vide (README seul). Aucune stack, aucun moteur, aucun schéma.

→ Greenfield : démarrage Phase 1 puis enchaînement des phases cœur moteur.

## Statut

| Phase | Contenu | Statut |
|-------|---------|--------|
| 1 | Architecture + UI + création puzzle | Fait |
| 2 | Scanner (photo/import/rotation/tips) | Fait |
| 3 | Détection pièces (pipeline CV canvas) | Fait (v1) |
| 4 | Analyse géométrique + côtés | Fait |
| 5 | Matching géométrie/couleur/texture | Fait |
| 6 | Validation / rejet / groupes / undo | Fait |
| 7 | Reconstruction 2D canvas | Fait (v1) |
| 8 | Image de référence + régions | Fait |
| 9 | IA vision (API serveur + fallback) | Fait |
| 10 | IA dans le ranking (optionnel) | Partiel |
| 11 | Assistant « Que faire maintenant ? » | Fait |
| 12 | Optimisation 500–1000+ | Partiel (index tab-type + top-K) |

## Prochaines itérations recommandées

1. Brancher OpenCV.js pour contours plus précis
2. UI correction détection (merge / split manuel)
3. Sync Supabase réelle + auth
4. Rerank IA uniquement sur top-N candidats
5. Benchmarks 300 / 500 / 1000 pièces
