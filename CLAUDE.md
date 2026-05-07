# CLAUDE.md — Instructions permanentes pour Claude Code
# Projet : INRAE Transfert · EU Projects Observatory
# Repo   : https://github.com/avermue/cordis-it
# Site   : https://avermue.github.io/cordis-it/

---

## 🌐 Contexte projet

Static webapp (HTML/JS/CSS pur, pas de bundler) déployée sur GitHub Pages.
Affiche les projets européens (FP7, H2020, Horizon Europe) où INRAE Transfert SAS participe.
Les données sont générées par un script Python à partir des exports CORDIS officiels.

---

## 📁 Architecture

```
~/codium/cordis-it/
├── index.html                  ← shell HTML (tabs, filtres, modale) — modifier avec précaution
├── css/style.css               ← tous les styles
├── js/
│   ├── data.js                 ← constantes, helpers, state global (VISIBLE_PROJECTS, FILTERED, FILTERS, VIEW_MODE…)
│   ├── sidebar.js              ← filtres latéraux (buildSidebar)
│   ├── cards.js                ← onglet Projects (renderCards)
│   ├── partners.js             ← onglet Partners (renderPartners)
│   ├── geography.js            ← onglet Geography (choroplèthe, régions, chart temporel)
│   ├── disciplines.js          ← onglet Disciplines (accordéon EuroSciVoc, sélection multi)
│   ├── budget.js               ← onglet Budget (stats + charts)
│   ├── timeline.js             ← onglet Timeline (Gantt + concurrent)
│   ├── modal.js                ← modale détail projet
│   └── app.js                  ← bootstrap, apply(), renderAll(), bindEvents()
├── data/
│   ├── inrae_projects.json     ← données générées par prepare_data.py (ne pas éditer à la main)
│   ├── geo-paths.json          ← chemins SVG pour la carte choroplèthe
│   └── cache/                  ← ZIP CORDIS en cache local (dans .gitignore)
├── scripts/
│   └── prepare_data.py         ← pipeline d'ingestion CORDIS (FP7 + H2020 + Horizon Europe)
├── .env                        ← token GitHub (dans .gitignore, ne jamais commiter)
├── deploy.sh                   ← copie index.html si nécessaire
└── CLAUDE.md                   ← ce fichier
```

---

## ⚙️ Stack technique

- **Données** : JSON statique (`data/inrae_projects.json`), chargé via `fetch()` au démarrage
- **Charts** : Chart.js 4.4.1 (CDN)
- **Fonts** : Spectral, Fira Code, Lato (Google Fonts)
- **Carte** : SVG choroplèthe avec chemins dans `geo-paths.json`
- **Taxonomie** : EuroSciVoc (arbre accordéon L1–L5 dans l'onglet Disciplines)
- **Déploiement** : `git push` → GitHub Pages automatique (branche `main`)

---

## 🎨 Conventions de style

- Langue : **français** dans la conversation, **anglais** pour tous les labels UI
- Couleur principale IT : `--it: #1a4f8a`
- Monospace : Fira Code (badges, métadonnées, codes)
- Badges programmes : `.tg-fp7` (violet), `.tg-h2020` (bleu), `.tg-he` (vert)
- Modifications **chirurgicales** uniquement — jamais réécrire un fichier entier si un str_replace suffit

---

## 🔀 Règles git — IMPÉRATIVES

1. **Branche unique** : toujours sur `main`, ne jamais créer d'autre branche
2. **Montrer le diff** avant toute modification de fichier, attendre confirmation
3. **Ne jamais commiter** sans demander confirmation explicite avec le message proposé
4. **Ne jamais pusher** sans demander confirmation explicite

### Procédure de push (avec token .env)

```bash
source .env
git remote set-url origin https://${GITHUB_TOKEN}@github.com/avermue/cordis-it.git
git push origin main
git remote set-url origin https://github.com/avermue/cordis-it.git
```

---

## 🔄 Quand relancer prepare_data.py ?

**Demander confirmation et exécuter le script si les modifications touchent à :**
- `scripts/prepare_data.py` lui-même
- La structure des données attendues par le JS (nouveaux champs, nouveaux programmes)
- Un bug de données constaté dans l'interface

**Ne pas relancer si :**
- Modification purement CSS/visuelle
- Modification d'un rendu JS sans impact sur les données
- Correction d'un bug d'affichage

**Procédure — toujours demander confirmation avant d'exécuter :**
> "La modification touche aux données. Je dois relancer prepare_data.py.
> Je propose : `python3 scripts/prepare_data.py --no-download` (~1 min, utilise le cache).
> On retélécharge tout (sans `--no-download`) seulement si les ZIP sont obsolètes.
> J'exécute ?"

Puis attendre "oui" avant de lancer :
```bash
cd ~/codium/cordis-it
python3 scripts/prepare_data.py --no-download   # utilise les ZIP en cache (rapide, ~1 min)
python3 scripts/prepare_data.py                  # retélécharge tout (lent, ~10 min)
```

Après exécution, afficher le bloc SUMMARY pour validation des comptages.

---

## 🧪 Test en local — À proposer après CHAQUE modification

Après toute modification de fichier, proposer systématiquement de lancer le serveur :
> "Veux-tu que je lance le serveur local pour tester ?"

Si oui, exécuter :
```bash
cd ~/codium/cordis-it
python3 -m http.server 8080
```

Puis indiquer : **→ ouvrir http://localhost:8080 en navigation privée**

⚠️ Toujours préciser **navigation privée** pour éviter les problèmes de cache navigateur.
Le serveur tourne jusqu'à Ctrl+C dans le terminal.

---

## 🚀 Workflow complet type

```
1. Modifier le(s) fichier(s) → montrer le diff → attendre OK
2. Si données impactées → proposer de relancer prepare_data.py → attendre OK → exécuter → afficher SUMMARY
3. Proposer de lancer le serveur local → attendre OK → exécuter
4. Attendre confirmation "ça marche en local"
5. Proposer le commit avec message → attendre confirmation
6. Proposer le push → attendre confirmation → exécuter avec procédure .env
```

---

## 📊 Données — points clés

- `ALL` = tous les projets bruts chargés depuis le JSON (`hasIT || hasINRAE`, ~826 projets)
- `VIEW_MODE` = `'IT' | 'INRAE' | 'BOTH'` — choix utilisateur, persisté dans `localStorage` (clé `cordis-it.viewMode`)
- `VISIBLE_PROJECTS` = sous-ensemble de `ALL` selon `VIEW_MODE` (recalculé via `applyViewMode()`)
- `FILTERED` = sous-ensemble de `VISIBLE_PROJECTS` après application des filtres utilisateur
- Les stats des onglets Geography et Disciplines utilisent `VISIBLE_PROJECTS` (pas `FILTERED`)
- `schemeGroup` est calculé côté JS à partir de `fundingSchemeShort` (pas `fundingScheme`)
- `SCHEME_GROUPS` est conçu pour ne **jamais** laisser de projet en `Other`. Le fallback `'Other': () => true` reste comme garde-fou silencieux mais doit rester vide en pratique. Si un nouveau schema apparaît dans le ZIP CORDIS et tombe dans `Other`, **étendre les règles** plutôt que d'accepter la catégorie.
- Statut : seules deux valeurs possibles dans le JSON final → `SIGNED` (Ongoing) et `CLOSED`. `TERMINATED` est normalisé en `CLOSED` côté pipeline (post-overrides) — c'est juste un libellé alternatif CORDIS pour les projets achevés.
- Statut live vs ZIP : le dump ZIP CORDIS est très en retard sur le site web. `prepare_data.py` vérifie sur cordis.europa.eu chaque projet `SIGNED && endDate < today` (IT **et** INRAE depuis 2026-05-06) et stocke les corrections dans `data/status_overrides.json`.
- FP7 : tous les projets ont le statut `CLOSED`, période 2008–2014
- EuroSciVoc : absent pour FP6 et antérieur, présent pour FP7/H2020/HE

---

## 🐛 Pièges connus

- Ne jamais utiliser `FILTERED` pour calculer les comptages de l'onglet Disciplines → utiliser `VISIBLE_PROJECTS` + `_domDescendants`
- À chaque changement de `VIEW_MODE`, invalider `window._domDescendants` et `window._domToIds` (déjà fait dans `applyViewMode()`)
- `topicToCat()` : toujours matcher sur les parties exactes du code topic (split sur `-`) pour éviter les faux positifs
- `schemeGroup()` doit recevoir `fundingSchemeShort` et non `fundingScheme` brut (les codes FP7 comme `CP-TP` ne matchent pas sinon). Pour les schemas HORIZON (préfixe stripé), travailler sur la valeur stripée (ex. `AG` et non `HORIZON-AG`).
- Si on étend `_fp7_map` dans `prepare_data.py`, étendre **aussi** `SCHEME_GROUPS` côté JS (filet de sécurité pour les ZIP non encore régénérés). Et inversement.
- `buildSidebar()` reconstruit les checkboxes — appeler `syncSidebarCheckboxes()` en fin pour re-cocher les filtres actifs (sinon les `FILTERS` restent en mémoire mais visuellement décochés après changement de `VIEW_MODE`).
- Toujours vérifier la balance accolades/crochets après toute modification JS (parser string-aware si doute)
