# Capitales — tout ce qu'il faut savoir

*Version française de `PROJECT.md`. Les deux documents décrivent le même projet ;
si l'un contredit l'autre, le code tranche.*

Un quiz sur les capitales du monde. L'écran montre la silhouette d'un pays avec
un point sur sa capitale ; il faut choisir la bonne ville parmi quatre. C'est le
remake d'un jeu écrit en Visual Basic vers 1996.

Tout tourne en local : aucun service en ligne, aucun compte, aucun accès réseau
une fois les données construites.

---

## 1. Le lancer

Il faut **Node 24+** et **npm 11+**. Rien d'autre : ni Java, ni serveur de base
de données, ni outils de compilation.

```bash
npm install
npm run seed        # une fois, charge 193 pays dans SQLite
```

Puis deux terminaux :

```bash
npm run server      # API sur http://127.0.0.1:8787
npm run dev         # le jeu sur http://localhost:5173
```

### Tous les scripts

| Script | Rôle |
|---|---|
| `npm run seed` | Charge `capitals.json` dans la base. Idempotent, on peut le relancer. |
| `npm run server` | Démarre l'API. N'a besoin de rien d'autre. |
| `npm run dev` | Serveur Vite pour l'app web, avec proxy de `/api` vers 8787. |
| `npm run build` | Bundle de production dans `apps/web/dist`. |
| `npm run dev:desktop` | Construit et lance l'application de bureau. |
| `npm run package:win` | Windows : installateur **et** exécutable portable. |
| `npm run package:linux` | Linux : archive tar.gz. |
| `npm run icons` | Régénère les icônes depuis les SVG. |
| `npm run build:data` | Relance l'ETL Natural Earth (rare, les sorties sont versionnées). |
| `npm test` | Toute la suite — 184 tests, rien à démarrer avant. |
| `npm run typecheck` | `tsc --noEmit` sur tous les paquets. |

---

## 2. Où se trouve le fichier SQLite

Deux emplacements, selon la façon de lancer le jeu :

| Comment vous lancez | Base de données |
|---|---|
| `npm run server` / `npm run dev` | `.data/capitales.db` dans le dépôt, ignoré par git |
| L'app Windows installée ou portable | `%APPDATA%\Capitales\capitales.db` |
| L'archive Linux | `~/.config/Capitales/capitales.db` |

Ce sont des fichiers distincts : une partie jouée dans le navigateur n'apparaît
pas dans le classement de l'application de bureau. L'état de développement et
celui de la vraie application restent séparés, volontairement.

La suite de cette section concerne celui de développement.

C'est un **état dérivé** : `npm run seed` reconstruit toutes les lignes de pays
à partir de fichiers versionnés. Le supprimer ne coûte que vos scores locaux. Si
vous changez le schéma, supprimez-le et re-semez — il n'y a pas d'outil de
migration, par choix.

```bash
rm -rf .data && npm run seed
```

Pour l'inspecter directement, Node 24 embarque SQLite : aucun client à
installer.

```bash
node -e "const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('.data/capitales.db');console.table(d.prepare('SELECT player_name,score FROM runs ORDER BY score DESC LIMIT 10').all())"
```

---

## 3. Le choix de SQLite

Le projet prévoyait au départ un émulateur Firebase local. Il a été remplacé
après avoir regardé honnêtement ce que le jeu stocke réellement : 193 fiches de
pays immuables et un classement.

Le seul vrai travail de Firestore aurait été de renvoyer ces 193 fiches au
démarrage — une base de données utilisée comme chargeur de fichier. Il fallait
en plus un processus Java dans un second terminal, et la seule requête que le
jeu effectue vraiment (`ORDER BY score DESC LIMIT 10`) est native en SQL, alors
qu'une base documentaire ne la sert que parce que cette forme précise est
indexable.

**Ce qui a rendu SQLite bon marché, c'est `node:sqlite`.** Historiquement, les
projets Node évitaient SQLite à cause de l'étape de compilation native de
`better-sqlite3`, qui sous Windows imposait node-gyp et plusieurs gigaoctets
d'outils MSVC. Node 22 a intégré SQLite au cœur du runtime et Node 24 le rend
stable : la couche de données ne coûte donc **aucune dépendance**.

Ce qui a été réellement perdu : les règles de sécurité déclaratives de
Firestore. La section 6 explique ce qui les remplace.

### Trois détails de `openDb()` qui comptent

```ts
db.exec('PRAGMA foreign_keys = ON');
```
SQLite désactive par défaut l'application des clés étrangères, pour rester
compatible avec des fichiers vieux de plusieurs décennies. Sans cette ligne, le
`REFERENCES runs(id) ON DELETE CASCADE` de `run_answers` n'est que décoratif.

```sql
) STRICT;
```
Par défaut, l'affinité de type de SQLite est **indicative** : la chaîne
`"banane"` entre sans broncher dans une colonne `INTEGER`. `STRICT` en fait une
erreur franche, ce qui transforme le schéma en véritable contrat. C'est aussi
pourquoi le code écrit `answer.correct ? 1 : 0` : SQLite n'a pas de type booléen
et une table `STRICT` refuse d'en recevoir un.

```ts
if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
```
La journalisation WAL permet aux lecteurs et à l'écrivain de travailler en
parallèle. Sans objet pour une base en mémoire, donc ignorée dans les tests.

### Schéma

```sql
countries      code (PK), name_en, name_fr, capital_en, capital_fr,
               capital_lon, capital_lat, continent,
               alt_capitals_en, alt_capitals_fr        -- tableaux JSON

runs           id (PK), player_name, score, correct_count, best_streak,
               question_count, started_at, finished_at

run_answers    run_id (FK), position, code, chosen, correct, ms
               PRIMARY KEY (run_id, position)
```

Les coordonnées sont des colonnes `REAL` séparées plutôt qu'un blob JSON :
ce sont les seules valeurs qu'on pourrait vouloir interroger, et une colonne ne
coûte rien.

`run_answers` est normalisée alors même que les statistiques par pays sont un
non-objectif déclaré. C'est un écart délibéré et bon marché au principe YAGNI :
une table de plus et une boucle d'insertion préservent la possibilité de
demander plus tard *« quelles capitales je rate systématiquement »* sans
migration. Jeter ce détail dans un blob non interrogeable aurait supprimé la
principale raison de préférer SQL ici.

L'écriture d'une partie insère dans les deux tables au sein d'**une seule
transaction** : un échec en cours de route ne peut pas laisser une partie
amputée de la moitié de ses réponses.

---

## 4. Organisation du dépôt

```
Capitales/
├─ .data/capitales.db          la base (ignorée par git)
├─ packages/
│  ├─ core/    TypeScript PUR — ni DOM, ni HTTP, ni node:*, ni Svelte
│  │           rng · types · i18n · localize · scoring · questions · game
│  ├─ geo/     d3-geo + TopoJSON → chemins SVG. Aucune UI.
│  │           atlas (recherche par code pays) · project (fitCountry)
│  ├─ data/    l'ETL Natural Earth + le client fetch du navigateur. Aucun SQL.
│  │           build-data · client · capitals.json · countries.topo.json
│  └─ ui/      composants Svelte : CountryMap, Timer, AnswerButton,
│              Scoreboard, LanguageToggle, Wordmark
└─ apps/
   ├─ server/  le SEUL module qui touche à SQLite
   │           schema · db · routes · host · server · seed
   ├─ web/     Vite + Svelte 5, assemble le tout
   └─ desktop/ enveloppe Electron ; héberge le serveur dans son propre processus
```

Le sens des dépendances est strictement unidirectionnel :
`apps/web → packages/ui → packages/{core, geo, data}`.

Deux frontières sont porteuses, et toute violation devrait être refusée en
relecture :

- **`packages/core` n'importe rien** — ni le DOM, ni Svelte, ni `node:*`, ni les
  autres paquets. C'est ce qui rend les règles du jeu testables sans navigateur,
  sans serveur et sans mock.
- **`apps/server` est le seul endroit où existe du SQL.**
  `packages/data/client.ts` parle JSON sur des chemins relatifs `/api` et ignore
  jusqu'à l'existence d'une base. Changer de backend est une modification d'un
  seul fichier.

Les paquets de l'espace de travail n'ont **aucune étape de compilation** : ils
exposent directement leurs sources TypeScript via leur champ `exports`, que Vite
et Vitest consomment tels quels. C'est la principale raison pour laquelle ce
monorepo reste simple.

---

## 5. La chaîne de données

`npm run build:data` est la seule étape qui touche au réseau. Ses deux sorties
sont versionnées, donc toutes les compilations et tous les tests ultérieurs
fonctionnent hors ligne.

**Source :** Natural Earth 50m, depuis le dépôt officiel
`nvkelso/natural-earth-vector` — `ne_50m_admin_0_countries.geojson` pour les
formes et `ne_50m_populated_places.geojson` pour les capitales.

**Sorties :** `packages/data/capitals.json` (60 Ko, 193 pays) et
`packages/data/countries.topo.json` (640 Ko de géométrie TopoJSON).

### Pourquoi 50m et pas 110m

Le jeu de données 110m, moins détaillé, ne donne que 163 pays jouables. Il omet
purement et simplement Singapour, Malte, Monaco, le Vatican, Andorre, le
Liechtenstein et tous les États insulaires des Caraïbes et du Pacifique : ils ne
sont pas dans le fichier. Le 50m donne 193 pays pour 640 Ko, chargés une seule
fois en local.

### Cinq pièges dans ces données, tous découverts à la dure

**1. La sentinelle `-99`.** Natural Earth met `ISO_A3` et `ISO_N3` à `-99` pour
cinq entrées, dont **la France et la Norvège**. Joindre la géométrie aux
capitales sur un champ ISO les perd silencieusement — aucune erreur, elles
n'apparaissent simplement jamais dans un quiz. Tout ici joint sur `ADM0_A3`, et
un test vérifie que la France survit.

**2. Johannesburg est étiquetée capitale sud-africaine.** Elle ne l'est pas. NE
liste quatre points « Admin-0 capital » pour ZAF, et prendre le premier
produirait une **mauvaise réponse**, pas seulement une ambiguïté.
`overrides.json` fixe Pretoria, et un test vérifie que Johannesburg n'apparaît
jamais comme option.

**3. Deux vrais pays n'ont aucune capitale dans le jeu de données.** Le Soudan du
Sud (Djouba) et Nauru (Yaren) n'ont aucun point « Admin-0 capital ». Ils sont
injectés par `overrides.json`. L'ETL **lève une exception** s'il rencontre un
autre pays souverain dans ce cas, au lieu de l'ignorer : ignorer, c'est ainsi
qu'un pays disparaît d'un jeu de géographie sans que personne ne le remarque
pendant un an.

**4. La simplification a détruit le Vatican.** `topojson-simplify` supprime les
sommets dont l'aire du triangle passe sous un seuil. Le polygone **entier** du
Vatican couvre 1,74e-8 stéradian — quatre ordres de grandeur sous un seuil même
modeste — donc la simplification a supprimé tous ses sommets et réduit l'anneau
à un point répété. Résultat : une entité d'aire nulle, `fitExtent` calcule une
échelle de `0`, `geoPath` renvoie `null`, et le pays devient impossible à
dessiner. Il n'y a donc **aucune étape de simplification** : la quantification
seule fait passer le fichier de 1360 Ko à 640 Ko, et simplifier n'économisait
que 9 Ko de plus. Le marché était : un pays silencieusement détruit contre 1,4 %
du fichier.

**5. Les territoires d'outre-mer sont dans la même entité que la métropole.** La
géométrie de la France compte 10 parties réparties sur 118° de longitude, de la
Guadeloupe à La Réunion. Son centroïde géométrique tombe **dans l'océan
Atlantique**. Cadrer la vue sur l'entité complète réduisait la France
métropolitaine à quelques taches méconnaissables. La section 7 explique le
correctif.

Dix entrées de type `Country` sont en réalité des dépendances — Jersey,
Guernesey, île de Man, Åland, Aruba, Curaçao, Saint-Martin, Groenland, Hong
Kong, Macao. Toutes les dix n'ont pas de capitale « Admin-0 », donc le filtre
*« souverain, et possède une capitale »* les élimine gratuitement. C'est
délibérément préféré à une liste noire maintenue à la main : le filtre découle
de données dont l'ETL a déjà besoin, il ne peut donc pas se périmer.

---

## 6. L'API

Quatre points d'entrée sur `127.0.0.1:8787`, servis par le `node:http` intégré.
Aucun framework : pour quatre routes sans intergiciel, Express serait plus de
machinerie que de message, et le proxy de Vite supprime entièrement la question
du CORS.

| Méthode | Chemin | Renvoie |
|---|---|---|
| `GET` | `/api/health` | `{ ok: true, countries: 193 }` |
| `GET` | `/api/countries` | les 193 fiches, toutes langues |
| `POST` | `/api/runs` | `{ id }` — enregistre une partie terminée |
| `GET` | `/api/leaderboard?limit=10` | les meilleurs scores, décroissants |

### La garantie d'ajout seul

Le `allow update, delete: if false` de Firestore tenait en quatre lignes
déclaratives. Ici, la même propriété vient de quelque chose d'invisible : **il
n'existe aucune route `PUT`, `PATCH` ou `DELETE`.** Un client ne peut pas
modifier un score passé parce que le verbe n'existe pas.

Comme une garantie assurée par du code **absent** ne se voit pas dans un diff,
les tests vérifient la négative directement : on enregistre une partie, puis on
tente `PUT` et `DELETE` dessus et on exige un `404`. Une propriété assurée par
du code manquant a plus besoin d'un test qu'une propriété assurée par du code
présent.

Il n'y a aucune authentification, volontairement. Le serveur n'écoute que sur
`127.0.0.1` : le seul client est la personne assise devant la machine. Un pseudo
est stocké sur la ligne de la partie et ne sert qu'à l'affichage.

### Gestion des erreurs

La règle directrice : **échouer bruyamment au démarrage, échouer en douceur
pendant la partie.**

| Panne | Comportement |
|---|---|
| Serveur non démarré | Une sonde bornée de `/api/health` affiche « lancez `npm run server` » en ~1,5 s, pas un écran blanc. |
| Base non semée | `/api/health` renvoie `countries: 0` → « lancez `npm run seed` ». |
| Un pays sans géométrie | Retiré du tirage au démarrage, avec un avertissement en console. |
| Échec d'enregistrement | Le score reste à l'écran, un bandeau l'indique, un bouton réessaie. Une partie terminée n'est jamais perdue à cause d'une erreur d'écriture. |

---

## 7. Le rendu des cartes

`fitCountry(feature, capital, box)` renvoie un chemin SVG, la position en pixels
de la capitale, et la boîte englobante du tracé.

La fonction construit une projection `geoAzimuthalEqualArea` centrée sur le
pays, appelle `fitExtent` pour qu'il remplisse la vue, puis dessine le contour
avec `geoPath` et place le point avec `projection(capitalLonLat)`. Comme les
deux passent par la **même instance de projection**, ils ne peuvent pas se
désynchroniser.

Équivalente plutôt que Mercator, pour que le Canada et le Groenland ne soient
pas rendus de façon absurde — la distorsion de Mercator donnerait en plus des
indices de difficulté involontaires.

### Le correctif du regroupement autour de la capitale

Vu le piège n°5 ci-dessus, la projection est cadrée sur la **masse continentale
où se trouve la capitale**, plus tout ce qui s'y rattache de proche en proche
dans un rayon de 8° d'arc.

Le chaînage, plutôt qu'un simple filtre de distance, est ce qui garde les vrais
archipels entiers : Okinawa rejoint Honshū via les îles Ryūkyū intermédiaires.
Le seuil de 8° a été calibré sur l'ensemble des données — il conserve l'archipel
arctique canadien, les 133 îles de l'Indonésie, le Japon et les Philippines,
tout en écartant les départements antillais et de l'océan Indien de la France.
Descendre à 5° commence à amputer le Canada ; monter à 12° ramène les Galápagos
dans l'Équateur.

L'amorce est la partie qui **contient** la capitale, et non celle dont le
centroïde est le plus proche. Le raccourci du centroïde le plus proche est
tentant et faux : Moscou est à 9,3° du centroïde de Kaliningrad mais bien plus
loin du centroïde de la masse russe principale, en Sibérie. Le centroïde le plus
proche amorcerait donc sur Kaliningrad et la dessinerait comme étant la Russie.

### Le test le plus précieux du projet

Vingt des 193 capitales se trouvent légèrement **en dehors** de leur propre
contour à la résolution 50m — Lisbonne, Stockholm, Beyrouth, Nassau et d'autres
villes côtières, de 0,3 à 3,8 km. Le cadre est donc élargi pour inclure une
capitale située jusqu'à 50 km à l'extérieur.

C'est ce plafond qui garde l'ensemble honnête. Élargir sans limite signifierait
que **n'importe quelle** coordonnée serait cadrée et paraîtrait plausible — y
compris une paire `[lat, lon]` transposée. À 50 km, un décalage côtier légitime
est absorbé, tandis qu'un Paris inversé, à 6000 km de là dans l'océan Indien,
reste loin hors du cadre, là où le test le rattrape.

`[lat, lon]` contre `[lon, lat]` produit du code qui tourne parfaitement et
dessine des points dans le mauvais hémisphère. C'est presque invisible en
relecture. D'où la règle : **toutes les coordonnées de ce projet sont
`[lon, lat]`**, l'ordre GeoJSON, converties une seule fois à la frontière de
l'ETL et plus jamais ensuite.

---

## 8. Règles du jeu

Dix questions, 15 secondes chacune.

Les mauvaises réponses proviennent autant que possible du **même continent**.
C'est un choix de difficulté délibéré : *« Paris / Berlin / Madrid / Rome »* est
une vraie question, alors que *« Paris / Oulan-Bator / Suva / Asuncion »* donne
la réponse.

**Le score**

```
bonusVitesse = 100 × msRestantes / msTotales    0 au buzzer, ~100 instantanément
série        = bonnes réponses consécutives, celle-ci comprise
multiplicateur = min(1 + 0,25 × (série − 1), 2)  1 · 1,25 · 1,5 · 1,75 · puis 2
points       = arrondi((100 + bonusVitesse) × multiplicateur)
```

Une mauvaise réponse ou un dépassement de temps vaut 0 et remet la série à zéro.
L'arrondi se fait une fois par question, donc le total affiché en cours de
partie correspond toujours au score final.

Quatre pays ont plusieurs capitales dans les données. `overrides.json` désigne
la réponse canonique et liste les variantes **également acceptées** :

| Pays | Canonique | Aussi accepté |
|---|---|---|
| Afrique du Sud | Pretoria | Le Cap, Bloemfontein |
| Bolivie | Sucre | La Paz |
| Côte d'Ivoire | Yamoussoukro | Abidjan |
| Birmanie | Naypyidaw | — |

---

## 8b. Les deux modes

`name` est le jeu de 1996 : choisir la capitale parmi quatre villes. `place`
montre le pays, nomme sa capitale, et demande de poser le repère là où se trouve
cette ville.

**L'écran-titre n'est pas devenu un menu.** Son titre décrivait déjà le mode —
« Nommez la capitale. » / « Une silhouette. Un repère. Quatre villes. » — donc le
sélecteur réécrit ces lignes au lieu d'ajouter une explication à côté. L'aperçu
enseigne le mode aussi : un repère à lire en `name`, une silhouette qui en
attend un en `place`. L'écran change, il ne grossit pas.

Le sélecteur reprend délibérément la forme de celui de la langue. Deux réglages
qui se ressemblent se comportent pareil, et le second ne s'apprend pas. Le choix
est mémorisé dans `localStorage` : au retour, un seul clic sépare du jeu.

La règle à conserver : **une action principale et au plus une rangée de choix.**
La difficulté ou les régions, si elles arrivent un jour, deviennent une seconde
rangée du même contrôle, ou elles n'arrivent pas.

### Le score d'un placement

```
distance  = haversine(repère, capitale)                kilomètres orthodromiques
précision = distance <= 25 ? 1 : exp(-(distance - 25) / 450)
points    = arrondi((100 + bonusVitesse) × précision × multiplicateur)
          = -arrondi(100 × min(1, (distance - 1500) / 1500))   au-delà de 1500 km
```

**La première version de cette courbe était fausse, et c'est en jouant qu'on l'a
vu.** Elle utilisait `racine(1 - d/2500)`, choisie pour être clémente sur les
quasi-réussites. Elle l'était beaucoup trop : 1000 km payaient encore 77 %, donc
un joueur cinq fois moins précis ne perdait qu'un sixième de ses points et
toutes les parties tombaient dans la même bande. Trois parties d'affilée au même
score, ce n'est pas un barème, c'est une formalité.

La décroissance exponentielle corrige ça. 100 km gardent 85 %, 500 km gardent
35 %, 1000 km gardent 11 %. Modélisé sur quatre profils de joueur, l'écart entre
une partie soignée et une partie approximative passe de 1,2× à 4×.

**Au-delà de 1500 km les points deviennent négatifs**, jusqu'à -100 au double de
cette distance. Un tir au hasard doit coûter quelque chose, sinon deviner est
gratuit et réfléchir devient facultatif. Ne rien poser du tout coûte le -100
plein : laisser filer le chrono est pire qu'une mauvaise réponse, parce que ce
n'est pas une tentative.

La pénalité ignore volontairement le multiplicateur de série. Un joueur en bonne
série ne doit pas être puni plus durement pour une mauvaise question qu'un
joueur en mauvaise passe.

Un repère à moins de **250 km** compte toujours comme dans la cible : il maintient
la série et alimente le décompte « n sur 10 dans la cible ».

Un placement parfait et instantané sur série maximale vaut 400, exactement comme
une bonne réponse instantanée en mode nommer. Aucun des deux modes ne paraît
gonflé à côté de l'autre, alors même que les classements sont séparés.

### Noté selon la taille du pays

Une distance de décroissance fixe donnait 200 km à 68 % pour le Vatican, dont le
rayon est d'un kilomètre, et exactement les mêmes 68 % pour la Russie, dont le
rayon est de 2318. Ce n'est pas une échelle, c'est un hasard : 200 km de Berne,
c'est avoir manqué la Suisse entière ; 200 km d'Ottawa, c'est une bonne réponse.

La distance de décroissance vient donc du pays. `fitCountry` publie le rayon d'un
disque de même aire que la masse terrestre **réellement affichée** — le
regroupement de la capitale, donc la France est mesurée sur la métropole et non
sur l'étalement atlantique de ses départements — et ce rayon, borné entre 120 et
900 km, sert d'échelle. La distance « dans la cible » et le seuil de raté
suivent.

| Pays | Rayon | Échelle | 50 km | 200 km | 600 km | Dans la cible | Raté |
|---|---|---|---|---|---|---|---|
| Vatican, Suisse, Belgique | 1–115 km | 120 | 81 % | **23 %** | 1 % | < 120 km | > 480 km |
| Espagne, France | 400–450 km | ~450 | 95 % | 68 % | 26 % | < 450 km | > 1800 km |
| Canada, Russie | 1773–2318 km | 900 | 97 % | **82 %** | 53 % | < 900 km | > 3600 km |

Le plancher évite qu'un micro-État exige une précision métrique ; le plafond
évite qu'un continent rende l'à-peu-près gratuit. Se tromper d'un rayon de pays
coûte à peu près la même chose partout — pas exactement, car les 25 km de
tolérance du mille sont une distance fixe, donc proportionnellement plus
clémente sur une petite échelle.

L'échelle voyage sur l'événement `PLACE` plutôt que d'être cherchée dans `core`.
L'événement transporte ce que le joueur avait réellement sous les yeux, et
`packages/core` continue de tout ignorer de la géométrie.

### Deux résumés, parce que ce sont deux jeux

L'écran de résultats affichait « 8 / 10 répondu · meilleure série 5 » dans les
deux modes. En mode placer c'est simplement faux : vous avez répondu aux dix
questions, et huit était le nombre de repères posés à moins de 250 km. Pire, la
statistique qui décrit réellement une partie de placement — l'écart — n'était
affichée nulle part.

Le mode placer commence désormais par elle : **« écart moyen 499 km · 4 / 10 dans
la cible · meilleure série 3 »**. Les dépassements de temps sont exclus de la
moyenne plutôt que comptés comme une distance énorme inventée, qui la noierait
sous un chiffre que le joueur n'a jamais choisi.

**Les classements sont distincts.** Nommer et placer sont deux compétences sur
deux courbes ; un classement mélangeant les deux ne classerait personne. La table
`runs` a gagné une colonne `mode`, et l'index commence par elle puisque le
classement est toujours demandé pour un seul mode à la fois.

### Deux choses que ça a mises au jour

`fitCountry` renvoie désormais `project` et `unproject` à côté du chemin. Un clic
repasse par **la projection même qui a dessiné la silhouette**, donc la réponse
est mesurée dans l'espace où elle a été donnée — la même raison qui empêche le
contour et le repère de se désynchroniser. Un test vérifie l'aller-retour sur
les 193 pays.

L'ajout de la colonne `mode` embarquait aussi un index sur elle, et
`CREATE TABLE IF NOT EXISTS` ne fait rien à une table qui existe déjà — donc sur
toute base créée par une version antérieure, `openDb` levait `SQL logic error`
avant même que le serveur ne démarre. Les index sont maintenant appliqués
*après* l'ajout des colonnes manquantes, et un test ouvre une base délibérément
ancienne pour le prouver. Les bases en mémoire qu'utilisent tous les autres
tests ont toujours le schéma du jour : aucun d'eux ne pouvait attraper ça.

## 9. La machine à états

```
idle → loading → ready → question ⇄ revealing → … → finished → submitting → leaderboard
                                                                     ↘ error
```

`ready` est l'écran-titre : une manche est distribuée mais le chronomètre ne
tourne pas. `revealing` est un temps d'environ 1,2 s qui montre quelle option
était la bonne — c'est ce qui fait qu'un quiz ressemble à un jeu plutôt qu'à un
formulaire.

Deux règles la rendent testable, et méritent d'être conservées :

**Le réducteur n'appelle jamais `Date.now()`.** Les événements transportent
l'horodatage ; l'état contient `questionStartedAt`. *« Répondu à 3 ms de la
fin »* devient un test unitaire ordinaire au lieu d'un exercice de simulation
d'horloge.

**Les battements du chronomètre ne sont pas des transitions d'état.** Le temps
restant est une valeur dérivée de `questionStartedAt` ; seule l'expiration réelle
émet `TIMEOUT`. Faire passer chaque battement par le réducteur provoquerait 15
mises à jour d'état par question et une tempête de rendus.

Une leçon apprise à la dure : le minuteur de révélation et celui de la question
sont pilotés par **un seul intervalle avec un seul chemin d'avancement**.
Programmer la révélation depuis le seul gestionnaire de clic bloquait le jeu
définitivement dès qu'une question expirait au lieu d'être répondue : plus rien
n'était là pour émettre `REVEAL_DONE`.

---

## 10. Anglais et français

Les deux langues viennent gratuitement de l'ETL : Natural Earth fournit
`NAME_FR` pour chaque pays et chaque capitale « Admin-0 », sans aucun trou.

L'API renvoie **toutes les langues à la fois**, et `localize(record, lang)`
réduit une fiche au `Country` monolingue que la logique de jeu utilisait déjà.
La génération des questions, le choix des distracteurs, la validation des
réponses, le score et le réducteur sont donc entièrement épargnés par la
localisation — et changer de langue est un remappage d'environ 193 objets déjà
en mémoire, pas un aller-retour réseau.

Les variantes françaises sont résolues **depuis les données** plutôt que
traduites à la main : Cape Town → **Le Cap** en découle automatiquement. L'ETL
lève une exception si un override nomme une ville absente du jeu de données.

62 des 193 capitales diffèrent réellement : Brussels → Bruxelles, Beijing →
Pékin, Ulaanbaatar → Oulan-Bator, Juba → Djouba.

Le sélecteur mémorise le choix dans `localStorage` et se règle par défaut sur la
langue du navigateur. **Changer de langue relance la manche**, volontairement :
échanger les libellés en pleine question changerait les quatre options sous le
curseur, et une partie comptabilisée moitié dans une langue, moitié dans l'autre
n'est pas une partie.

Les textes d'interface vivent dans `packages/core/src/i18n.ts`, dans un
enregistrement plat typé. Avec deux langues et une vingtaine de clés, un
framework d'i18n serait plus de machinerie que de message ; le typer en
`Localized<Record<MessageKey, string>>` fait d'une traduction française manquante
une **erreur de compilation** plutôt qu'un libellé vide.

---

## 11. Les meilleurs scores

Une partie terminée ne demande votre nom que si le score **dépasse réellement la
dixième entrée**. Sinon le classement s'affiche en lecture seule. Être invité à
saisir un nom est la récompense ; le demander à chaque fois la banaliserait.

Les égalités ne qualifient **pas** quand le classement est plein : rejouer le
même score ferait sinon tourner indéfiniment la dernière place sans jamais
constituer un progrès. Un score nul ne qualifie jamais, même sur un classement
vide.

Si le serveur est injoignable à ce moment-là, le score reste à l'écran et la
partie n'est simplement pas enregistrée. Une panne réseau ne doit jamais vous
coûter votre résultat.

Au-delà de cinq entrées, le classement s'affiche sur **deux colonnes de cinq** :
c'est exactement la hauteur qui manque à une liste complète sur une fenêtre
d'ordinateur portable.

---

## 12. Les tests

**184 tests, un seul `npm test`, rien à démarrer avant.**

Ce dernier point découle directement du choix de SQLite : les tests d'API
démarrent le vrai serveur dans le processus, sur un port éphémère, contre une
base `:memory:`, et le pilotent avec un simple `fetch`. Aucun processus externe,
aucun fichier de fixture, aucun nettoyage — chaque fichier de test reçoit une
base vierge gratuitement.

| Domaine | Ce qui est couvert |
|---|---|
| `core` | Déterminisme du générateur, génération des questions, bornes du score, le réducteur complet, la localisation, la règle du top 10 |
| `geo` | Sélection du regroupement, cadrage de la projection, et le garde-fou des coordonnées inversées |
| `data` | Intégrité de `capitals.json` — nombre, tri, plages de coordonnées, les deux langues, chaque override, la jointure avec la géométrie |
| `server` | Les quatre points d'entrée, les corps malformés, et la garantie d'ajout seul |

Le générateur pseudo-aléatoire à graine est ce qui rend tout cela possible : la
même graine produit les mêmes dix pays, dans le même ordre, avec les mêmes
options. *« Le quiz est aléatoire »* et *« les tests sont déterministes »* sont
vrais simultanément.

---

## 13. Limites assumées

**Le client connaît les réponses.** `/api/countries` renvoie les noms de
capitales et le navigateur charge les 193 au démarrage : la bonne réponse est
donc en mémoire avant que vous ne cliquiez. Le score est également calculé côté
client ; le serveur enregistre ce qu'on lui dit.

Les deux sont assumés délibérément. Fermer l'un ou l'autre supposerait que le
serveur détienne les questions et corrige les réponses — une complexité
substantielle pour aucun bénéfice dans un jeu local à un joueur, où la seule
personne susceptible de tricher est celle qui veut jouer.

**Les micro-États sont difficiles.** Le Vatican fait 1,1 km de large. Il
s'affiche correctement et son repère est visible, mais le reconnaître est
réellement ardu. C'est une fonctionnalité, en un sens.

---

## 14. Distribution

```bash
npm run dev:desktop      # construire et lancer
npm run package:win      # Windows : installateur + portable
npm run package:linux    # Linux : archive
npm run icons            # régénérer les icônes depuis les SVG
```

### Windows

`npm run package:win` produit deux fichiers, d'environ 101 Mo chacun — le
plancher d'Electron, puisque chacun embarque un Chromium complet :

| Fichier | Ce que c'est |
|---|---|
| `Capitales-0.0.0-setup.exe` | Installateur. Ajoute un raccourci au menu Démarrer et un désinstalleur, et laisse choisir le dossier d'installation. |
| `Capitales-0.0.0-portable.exe` | **Aucune installation.** Double-clic et ça tourne. Rien n'est ajouté au menu Démarrer et il n'y a rien à désinstaller : supprimez le fichier et c'est fini. |

Le portable se décompresse dans `%TEMP%\Capitales-<version>\` au premier
lancement puis réutilise ce dossier, au lieu de réextraire 100 Mo à chaque fois.

Il conserve malgré tout sa base dans `%APPDATA%\Capitales\`, et non à côté de
l'exécutable. C'est délibéré : un exécutable portable est souvent lancé depuis
une clé USB ou un partage en lecture seule, où écrire à côté du binaire
échouerait. La contrepartie est que « portable » signifie ici *sans
installation*, et non *sans trace* : vos scores survivent à la suppression de
l'exe, et vous suivent si vous le remplacez par une version plus récente.

### Le serveur vit dans le processus Electron

Le serveur d'API tourne **à l'intérieur** du processus principal d'Electron, et
non comme processus enfant. Ce n'est possible que parce que `apps/server` est un
module Node ordinaire sans aucune dépendance au navigateur, et cela apporte
trois choses : un seul processus à surveiller, aucune négociation de port avec
un enfant, et aucun serveur orphelin si la fenêtre est tuée.

Ce même serveur sert aussi les fichiers web compilés : le rendu s'adresse donc à
une origine unique et les chemins relatifs `/api` du client fonctionnent sans
proxy et sans CORS — exactement comme derrière Vite en développement. Le port
vaut `0`, c'est-à-dire que le système en choisit un libre, ce qui évite toute
collision avec un serveur de développement déjà lancé.

Trois détails auraient chacun cassé la version empaquetée :

**La base va dans le dossier de données utilisateur**, jamais à côté de
l'exécutable. Une application installée ne peut pas écrire à côté de son propre
binaire, et tout ce qui se trouve dans le dossier d'installation est effacé par
la mise à jour suivante — emportant les meilleurs scores avec lui.

**L'application se sème elle-même au premier lancement.** Il n'y a aucun
terminal pour lancer `npm run seed`, donc `capitals.json` est embarqué et planté
si la table des pays est vide.

**Le schéma est une chaîne TypeScript, pas un fichier `.sql`.** Le processus
principal est compilé en CommonJS, où `import.meta.url` est vide : résoudre un
fichier voisin à l'exécution renvoyait le mauvais chemin et plantait au
démarrage. L'intégrer au code le fait voyager avec chaque build.

Electron plutôt que Tauri : Tauri produirait un installateur de ~5 Mo au lieu de
~101 Mo, mais il exige la chaîne d'outils Rust et les MSVC Build Tools, soit
plusieurs gigaoctets absents de cette machine. L'enveloppe ne détient aucune
logique de jeu, donc en changer plus tard reste une modification contenue.

**Tactile.** La mise en page se replie sur une colonne sous 940 px, et en dessous
la carte reçoit la rangée flexible tandis que les réponses gardent leur hauteur
naturelle — sans ça la carte s'écrasait à 205 px sur téléphone. Mesurée sur un
écran de 375×812, elle fait maintenant 329 px, soit 41 % de la hauteur.

La conception d'origine annonçait « la carte sur ~55 % », ce que l'arithmétique
interdit : quatre cibles tactiles de 60 px et leurs espacements font 266 pixels
incompressibles, donc ~41 % est le plafond honnête. Les 124 px gagnés viennent
de la suppression de rangées qui méritent leur place sur un écran d'ordinateur
et pas sur un téléphone — le surtitre qui répète la question juste en dessous,
la légende qui nomme un point n'ayant pas besoin de nom, et un pied de page vide
en dehors de l'écran-titre.

Sur pointeur grossier, les pastilles A–D sont masquées puisqu'elles annoncent un
clavier absent, et les états de survol cèdent la place à un `:active`.
`env(safe-area-inset-*)` écarte le cadre des encoches et des barres de gestes.

Le classement en deux colonnes n'est actif qu'à partir de 560 px de large : il
existe pour récupérer de la place *verticale* sur une fenêtre d'ordinateur
portable, et sur un téléphone de 360 px deux colonnes de noms débordaient
horizontalement de 49 px.

### La version fichier unique

```bash
npm run build:single    # -> apps/single/dist/index.html, un fichier, 780 Ko
```

On double-clique. Ça s'ouvre dans le navigateur déjà installé, sous Windows,
Linux, macOS ou sur téléphone. Rien à installer, rien à désinstaller, et ça
s'envoie en pièce jointe.

**Pourquoi c'est 130 fois plus petit que l'exécutable.** L'application ne pèse
que 1637 Ko une fois construite ; les 99,7 Mo restants de l'installateur sont
Chromium. Cette version n'embarque aucun runtime et emprunte le navigateur que
la machine possède déjà.

Passer de 1637 Ko à 780 Ko tient presque entièrement aux polices : les polices
web embarquées font 879 Ko, et les inliner imposerait du base64, soit un tiers
de plus. Cette version utilise des piles de polices système choisies pour
préserver le caractère typographique — une linéale humaniste, une vraie italique
à empattements pour la ligne d'affichage, une à chasse fixe d'aspect technique —
toutes présentes sous Windows, macOS et les bureaux Linux courants.

**Comment fonctionne la substitution du stockage.** `packages/data-local`
exporte exactement les trois fonctions qu'`apps/web` importe de
`@capitales/data` — `loadCountries`, `saveRun`, `topScores` — adossées aux
données embarquées et à `localStorage`. `apps/single/vite.config.ts` aiguille
l'une vers l'autre par alias : pas une ligne du jeu, de l'interface ou du store
ne sait laquelle elle a reçue, et aucun code parlant à un serveur n'atteint le
bundle. Cette substitution n'est possible que parce que rien au-dessus de cette
couche n'a jamais su qu'une base de données existait.

L'alias est ancré par `/^@capitales\/data$/` plutôt que par une chaîne simple :
une chaîne simple capture aussi le préfixe de `@capitales/data/capitals.json` et
réécrit ce sous-chemin vers le fichier de remplacement.

**Vérifié sur une vraie origine `file://`**, et pas seulement en HTTP : le
module inline s'exécute, `localStorage` fonctionne, une manche complète de dix
questions se joue, et un score revendiqué survit au rechargement.

**Ce qu'on abandonne :** SQLite, et un classement partagé entre navigateurs. Les
scores vivent dans le `localStorage` de ce navigateur — par navigateur, par
machine.

La boîte de saisie du nom, sur l'écran de résultats, se dimensionnait sur son
contenu — champ, bouton et marge intérieure — et débordait simplement d'un écran
étroit, emportant le bouton Enregistrer hors du cadre. `.results` centre ses
enfants au lieu de les étirer, donc rien ne contraignait la largeur. Elle a
désormais `max-width: 100%`, le champ peut rétrécir (`min-width: 0`, ce qu'un
champ texte refuse autrement), et sous 480 px il se place au-dessus du bouton —
qui devient au passage une meilleure cible tactile.

Celui-là vaut surtout comme leçon de test, pas de CSS. Le balayage précédent en
360×640 n'avait rien signalé parce que le classement était plein : le score ne
qualifiait pas, donc **la boîte ne s'affichait jamais**. Seule une première
partie sur un classement vide atteint cette branche. Mesurer un écran n'est pas
mesurer ses états.

### Android

```bash
npm run package:android   # -> apps/android/release/Capitales-debug.apk, 4,5 Mo
```

**Capacitor**, qui emballe l'application dans la WebView d'Android. Même principe
que la version fichier unique et pour la même raison : le téléphone possède déjà
un moteur de rendu, donc l'APK n'en embarque pas. C'est pourquoi il fait 4,5 Mo
et non les 101 Mo d'Electron.

**`webDir` pointe sur `apps/single/dist`.** L'app Android n'a pas de bundle à
elle : la version fichier unique contient déjà la géométrie, les données et les
styles, et range déjà les scores dans `localStorage`, ce qu'une WebView fournit
nativement. L'app mobile n'a donc besoin ni de couche de données, ni de serveur,
ni de plugin SQLite — le travail qui a rendu un seul fichier HTML autonome est
exactement celui dont une app mobile hors ligne a besoin.

**Deux JDK.** Gradle refuse de démarrer sur une JVM plus récente que ce qu'il
connaît. Le Java du système est ici en 25, Gradle 8.14 s'arrête à 24, et le
message est le mémorable `Unsupported class file major version 69` — 69 étant
Java 25, dans une table qui va de 65 = Java 21 à 69 = Java 25. Le JDK embarqué
dans Android Studio est lui aussi en 25 et n'aide en rien : celui-là fait tourner
l'IDE, pas Gradle. Un JDK 21 est donc installé à côté, et `build-apk.mjs`
recherche un JDK dans la plage supportée pour ne l'utiliser que sur cette
compilation, sans toucher au défaut du système.

**Les icônes.** Android réclame une icône adaptative — un calque avant transparent
que le lanceur masque et décale au-dessus d'une couleur de fond — plus les icônes
carrée et ronde héritées pour les lanceurs plus anciens.
`apps/android/make-icons.mjs` produit les deux depuis du SVG, en utilisant le
dessin simplifié sous 96 px pour la même raison que la version bureau. Le repère
reste dans la zone sûre intérieure, les lanceurs rognant le quart extérieur d'une
icône adaptative.

**Une réserve, énoncée parce qu'elle n'est pas testée.** Le manifeste déclare
encore la permission `INTERNET` que Capacitor ajoute par défaut. Le jeu ne fait
aucune requête réseau, elle devrait donc disparaître — mais Capacitor sert ses
fichiers via un intercepteur local, et vérifier que la retirer n'empêche pas
l'app de démarrer demande un vrai appareil, indisponible ici. Pour essayer :
supprimez la ligne `uses-permission` de
`apps/android/android/app/src/main/AndroidManifest.xml`, recompilez, installez
sur un téléphone. Si l'app s'ouvre, la permission était inutile.

L'APK est une version de débogage, donc signée avec la clé jetable de debug :
parfait pour l'installer sur votre propre téléphone, pas pour de la distribution.

**`apps/android/android/` est ignoré par git.** Il est généré par
`npx cap add android` ; les sources sont `capacitor.config.ts`, `assets/` et les
deux scripts. Régénérez-le avec `npx cap add android` depuis `apps/android`.

### Linux

`npm run package:linux` produit `Capitales-0.0.0-x64.tar.gz` : on extrait et on
lance `./capitales`. L'archive contient tout, polices comprises, donc la version
Linux est aussi hors ligne que celle de Windows.

**AppImage et `.deb` ne peuvent pas être construits sous Windows.** AppImage a
besoin de `mksquashfs` et electron-builder va le chercher dans un chemin
`darwin/` quand on l'invoque depuis Windows ; `.deb` réclame l'outillage de
paquets Debian. Les deux fonctionnent depuis une machine Linux, WSL ou Docker —
les cibles sont déjà configurées, donc `npm run package:linux:all` produit les
trois là-bas. Sous Windows, le script par défaut ne demande que `tar.gz`, qui se
construit partout, plutôt que d'échouer.

L'exécutable Linux s'appelle explicitement `capitales`. Laissé à lui-même,
electron-builder le dérive du nom de paquet et produit `@capitalesdesktop`, que
AppImage refuse catégoriquement.

### Les icônes

`apps/desktop/assets/icon.svg` est le repère de relevé — le même motif que le
jeu peint sur chaque capitale. Il existe un second dessin, `icon-small.svg` : en
dessous de 48 px le graticule devient de la boue et les tirets disparaissent,
donc les petites tailles proviennent d'une version simplifiée à l'anneau plus
épais et au point plus gros. `make-icons.mjs` choisit la bonne source selon la
taille et produit `icon.ico` (7 tailles), un `icon.png` de 512 px, et un dossier
`icons/` pour Linux.

Les fichiers rendus sont versionnés bien qu'ils soient générés. Les régénérer
exige `sharp`, un rasteriseur natif, et imposer cette dépendance à chaque build
pour 100 Ko de PNG serait un mauvais marché — le même raisonnement que pour les
sorties de l'ETL.

---

## 15. Ce qui n'est pas encore fait

- Une suite de tests de bout en bout Playwright
- **La signature de code.** Aucune des deux versions Windows n'est signée, donc
  SmartScreen avertit au premier lancement. Signer exige un certificat payant.
- **AppImage et `.deb`**, configurés mais nécessitant Linux, WSL ou Docker pour
  être réellement produits (§14)

**`apps/mobile` a été abandonné**, pas oublié. La conception d'origine prévoyait
une enveloppe tactile distincte comme troisième variante. Le travail de
responsive fait pour tenir dans une fenêtre d'ordinateur portable en a absorbé
l'essentiel : mesuré en 375×812, la mise en page se replie sur une colonne sans
aucun débordement, les quatre réponses restent au-dessus de la ligne de
flottaison, et les boutons font 56 px — au-dessus du plancher d'accessibilité de
44 px. Un quatrième paquet dupliquerait aujourd'hui une mise en page qui marche
déjà.

Ce qu'une passe tactile apporterait encore, en retouches d'`apps/web` et non en
nouvelle application : une carte plus grande (205 px sur téléphone, c'est
étriqué), le masquage des pastilles A–D là où il n'y a pas de clavier, la
suppression des états de survol, et la gestion des encoches.

Hors périmètre volontairement : le choix d'une région ou d'une difficulté, la
répétition espacée, et un écran de révision des erreurs.

Le document de conception complet et le plan d'implémentation se trouvent dans
`docs/superpowers/`. La version anglaise de ce document est `PROJECT.md`.
