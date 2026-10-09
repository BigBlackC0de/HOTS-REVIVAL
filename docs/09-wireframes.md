# 9. Wireframes

Charte : fond `void-900 #0b0d1a`, cartes `void-850`, **bleu Heroes** `storm-500 #1f8fff`, **violet Nexus** `nexus-500 #8b5cf6`, **doré Blizzard** `gold-400 #f5c451`, titres en *Cinzel*, texte en *Inter*. Mode sombre uniquement. Inspirations : Porofessor (overlay compact), Blitz/Mobalytics (score et rapport), OP.GG (historique).

## 9.1 Tableau de bord (profil)
```
┌──────────────┬───────────────────────────────────────────────────────────────────────┐
│ HOTS         │  AZSRA                                                                │
│ REVIVAL      │  Rôle principal : Assassin à distance · secondaire : Soigneur         │
│ slogan       │ ┌────────────┐┌────────────┐┌────────────┐┌────────────────┐          │
│              │ │WINRATE     ││PARTIES     ││HEROS SCORE ││TENDANCE (10)   │          │
│ ◆ Tableau    │ │ 53.3 %     ││ 30         ││ 52.7 /100  ││ ▲ 60 %         │          │
│ ⚔ Parties    │ └────────────┘└────────────┘└────────────┘└────────────────┘          │
│ ♜ Draft      │ ┌──────────────────┐┌──────────────────┐┌──────────────────┐          │
│ ✦ Coach IA   │ │ RADAR HEROS SCORE ││ WINRATE PAR RÔLE ││ SYNTHÈSE         │          │
│ ◎ Overlay    │ │   (hexagone 6     ││ Assassin ▓▓▓▓░ 50%││ Meilleur : X     │          │
│ ⚙ Paramètres │ │    catégories)    ││ Soigneur ▓▓▓░░ 40%││ Pire : Y         │          │
│              │ └──────────────────┘└──────────────────┘│ À éviter : ⚠ Z   │          │
│              │ ┌───────────────────────────────────────┴──────────────────┐          │
│ ● Backend OK │ │ PROGRESSION  ╱╲__╱╲___╱╲/╲__  (courbe HEROS SCORE)        │          │
│ Partie : —   │ └──────────────────────────────────────────────────────────┘          │
│ conformité   │ │ TABLE HÉROS : Héros | Parties | Winrate | HEROS SCORE   │          │
└──────────────┴───────────────────────────────────────────────────────────────────────┘
```

## 9.2 Historique des parties
```
┃VICTOIRE┃ Valla        │ Tours du Destin │ 8/2/11 │ 17:42 │ 08/10 21:14 │  78 ┃
┃DÉFAITE ┃ Jaina        │ Braxis Holdout  │ 3/5/7  │ 13:45 │ 08/10 20:40 │  52 ┃
   (bordure gauche bleue = victoire, rouge = défaite ; score coloré : doré ≥75, bleu ≥55, violet ≥40, rouge)
```

## 9.3 Rapport post-partie
```
← Parties
TOURS DU DESTIN                                              HEROS SCORE
Storm League · 13:45 · Valla                                      70
┌ RÉSUMÉ ──────────────────────────────────────────────────────────────┐
│ Partie perdue à 13:45 sur Tours du Destin. Vous avez participé à 92 %│
│ des éliminations. Votre principal problème fut votre survie.         │
│ [Participation 92 %] [K/D/A 6/5/6] [Temps mort 158 s] [Dégâts 31 %]  │
│ [✦ Générer l'analyse IA]  [Poser une question au coach]              │
└──────────────────────────────────────────────────────────────────────┘
┌ HEROS SCORE ─────┐┌ POINTS FORTS ──────────┐┌ POINTS FAIBLES ─────────┐
│  radar           ││ ✔ Bonne présence TF    ││ ✖ 5 morts               │
│ Placement ▓▓▓ 81 ││ ✔ Dégâts prioritaires  ││ ✖ 158 s mort            │
│ Macro     ▓▓░ 64 ││ ACTIONS EXCELLENTES    ││ ERREURS MAJEURES        │
│ Teamfight ▓▓▓ 89 ││ ★ …                    ││ ! Mort à 7:12 isolée    │
│ Objectifs ▓▓░ 75 │└────────────────────────┘└─────────────────────────┘
│ Survie    ▓░░ 42 │┌ MOMENTS CLÉS ──────────┐┌ PLAN D'AMÉLIORATION ────┐
│ Draft     ▓▓░ 60 ││ ⏱ 7:30 niveau 10 adv.  ││ ➜ Réduire vos morts à 3 │
└──────────────────┘└────────────────────────┘└─────────────────────────┘
┌ TABLEAU DES SCORES (10 joueurs, ligne « vous » surlignée) ───────────────┐
```

## 9.4 Draft Assistant
```
DRAFT ASSISTANT                                         [ Carte : Tours du Destin ▾]
┌ VOTRE ÉQUIPE ────┐ ┌ ÉQUIPE ADVERSE ──┐ ┌ BANS ─┐
│ [Valla       ▾]  │ │ [E.T.C.     ▾]   │ │ [  ▾] │
│ [Uther       ▾]  │ │ [Jaina      ▾]   │ │ [  ▾] │
│ [— Héros —   ▾]  │ │ [— Héros —  ▾]   │ │ [  ▾] │
└──────────────────┘ └──────────────────┘ └───────┘
┌ NOTE 38/100 ─────┐┌ FORCES ─────────┐┌ FAIBLESSES ──────────────────┐
│ Early ▓▓▓░ 50 %  ││ ✔ …             ││ ✖ Pas de tank                │
│ Mid   ▓▓▓░ 50 %  │└─────────────────┘└──────────────────────────────┘
│ Late  ▓▓▓░ 50 %  │┌ SYNERGIES ┐┌ MENACES ─────────────────┐┌ WIN CONDITIONS ┐
└──────────────────┘│ ✦ …       ││ ⚠ Combo E.T.C. + Jaina   ││ ➜ Protégez Valla│
┌ COUNTERS ────────────────────┐┌ PICKS RECOMMANDÉS ───────────────────────┐
│ ⚔ Muradin est le meilleur    ││ #1 Muradin  Tank       vous : 60 % · 2.4 │
│   choix contre cette draft.  ││ #2 …                                     │
```

## 9.5 Coach IA
```
COACH IA                                   [Contexte : D · Valla · Tours du Destin ▾]
Propulsé par Claude
┌──────────────────────────────────────────────────────────────────────┐
│                                   ┌───────────────────────────────┐  │
│                                   │ Pourquoi ai-je perdu ?        │  │
│                                   └───────────────────────────────┘  │
│ ┌────────────────────────────────────────────────┐                   │
│ │ **Votre survie a coûté la partie.** 5 morts…   │                   │
│ │ - Priorité 1 : …                               │                   │
│ └────────────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────────┘
(Pourquoi ai-je perdu ?) (Pourquoi ai-je gagné ?) (Que dois-je améliorer ?) (…)
[ Votre question…                                            ] [Envoyer]
```

## 9.6 Overlay en jeu (coin supérieur droit, 340 px)
```
┌ HOTS REVIVAL ─────────────── 9:12 ┐
│▌Le prochain objectif arrive dans  │   ← alerte (8 s, bordure dorée)
│▌45 secondes.                      │
│ Autels                       0:45 │
│ Priorité : Regroupement · estim.  │
│ Alliés niv. 9   ▼ talent  Adv. 10 │
│ Camp siège                   1:12 │
│ BUILD RECOMMANDÉ                  │
│ 1  Hot Pursuit       58 % · 40 %  │
│ 4  Arsenal           55 % · 62 %  │
│ ✦ Ne forcez pas un combat en      │
│   infériorité de talent.          │
└───────────────────────────────────┘
Mode interactif (Ctrl+Shift+I) : [Allié +1][Allié −1][Adv. +1][Adv. −1]
                                 [Siège][Combattant][Boss][Soutien]
                                 [Objectif terminé][Sync 0:00][Fin]
```

## 9.7 Paramètres
```
REPLAYS : dossier surveillé ✔ · surveillance active · toon 2-Hero-1-1278570 · parsed 120 · failed 1
          [ autre dossier/fichier…                    ] [Importer]
COACH IA : Actif · modèle claude-opus-5-5
CONFORMITÉ BLIZZARD : Sources utilisées ✔ … | Jamais ✖ …
```
Les captures de l'implémentation actuelle peuvent être régénérées avec les données de démonstration (`backend/scripts/seed_demo.py`).
