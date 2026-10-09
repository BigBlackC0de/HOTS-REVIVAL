# 10. HEROS SCORE (algorithme v1.0)

Note propriétaire sur 100, calculée **uniquement à partir du replay** et de la draft (donc reproductible et conforme). Implémentation : [`backend/app/analytics/heros_score.py`](../backend/app/analytics/heros_score.py).

## 10.1 Principe
Chaque catégorie est la moyenne de **composantes normalisées** : une composante vaut 0 au seuil « faible » et 100 au seuil « excellent » pour le rôle du héros (interpolation linéaire bornée). La note globale est une moyenne pondérée **par rôle**.

```
scale(v, faible, excellent) = clamp((v − faible) / (excellent − faible), 0, 1) × 100
```

## 10.2 Catégories et composantes

| Catégorie | Composantes (source replay) | Seuils (faible → excellent) |
|---|---|---|
| **Survie** | morts / 10 min (`Deaths`) | 4,5 → 1,5 (Tank 5,5 → 2 ; Combattant 5 → 1,8) |
| | % de la partie passé mort (`TimeSpentDead`) | 20 % → 4 % |
| | évasions / 10 min (`EscapesPerformed`, si présent) | 0 → 2 |
| **Placement** *(indicateurs indirects v1)* | part des morts en infériorité numérique (`OutnumberedDeaths`) | 70 % → 15 % |
| | Tank/Combattant : part des dégâts encaissés de l'équipe | 15 % → 35 % |
| | Autres : part des dégâts encaissés (moins = mieux) | 30 % → 12 % |
| | morts / 10 min | idem Survie |
| **Teamfight** | participation aux éliminations (`Takedowns` / kills équipe) | 35 % → 80 % |
| | Soigneur : part des soins de l'équipe | 40 % → 75 % |
| | Autres : part des dégâts héros (par rôle) | ex. Assassin distance 15 % → 30 % |
| | Tank/Combattant/Soutien : contrôle / min (`TimeCCdEnemyHeroes`) | 1 s → 6 s |
| **Macro** | part de l'XP de l'équipe | 14 % → 28 % |
| | part des dégâts de siège (par rôle) | ex. Combattant 12 % → 30 % |
| | camps / 10 min | 0 → 2 (Combattant, Soutien : 0 → 3) |
| **Objectifs** | camps / 10 min | idem |
| | part des dégâts aux structures (`StructureDamage`) | 8 % → 25 % |
| | tours de guet / 10 min (`WatchTowerCaptures`) | 0 → 2 |
| | présence (1 − % temps mort) | 80 % → 97 % |
| **Draft** | note de composition du moteur de draft pour l'équipe du joueur | 0–100 |

## 10.3 Pondérations de la note globale

| Rôle | Placement | Macro | Teamfight | Objectifs | Survie | Draft |
|---|---|---|---|---|---|---|
| Tank | 25 % | 10 % | 25 % | 15 % | 15 % | 10 % |
| Combattant | 15 % | 25 % | 20 % | 15 % | 15 % | 10 % |
| Soigneur | 25 % | 5 % | 30 % | 10 % | 20 % | 10 % |
| Soutien | 15 % | 25 % | 20 % | 15 % | 15 % | 10 % |
| Assassins (défaut) | 20 % | 15 % | 25 % | 10 % | 20 % | 10 % |

## 10.4 Exemple
Valla, défaite 13:45, 5 morts, 158 s mort, 92 % de participation, 31 % des dégâts :

| Catégorie | Note |
|---|---|
| Placement | 81 |
| Macro | 64 |
| Teamfight | 89 |
| Objectifs | 75 |
| Survie | 42 |
| Draft | 60 |
| **Global** | **≈ 70** |

## 10.5 Explicabilité
`heros_scores.details` stocke chaque composante (`{"survival": {"deaths_per_10min": 22.2, "time_dead_pct": 46.3}, …}`) : l'UI et le coach peuvent expliquer *pourquoi* une catégorie est basse.

## 10.6 Limites et feuille de route
- v1 : seuils éditoriaux, non calibrés statistiquement. **v1.1** : seuils = percentiles 20/80 par rôle et par palier de rang sur le corpus importé (≥ 5 000 lignes).
- Placement réel (V2) : positions des unités (`SUnitPositionsEvent`) post-partie → distance à l'équipe au moment des morts.
- Le score compare à des repères de rôle, pas à des adversaires : une partie gagnée peut avoir un score moyen et inversement.
