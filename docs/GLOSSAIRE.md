# Glossaire — OpenQuittance

Termes métier de la gestion locative française expliqués
simplement. Pour les débutants.

## A

### Avis d'échéance

Document optionnel envoyé en début de mois au locataire pour
l'informer du loyer à venir (avant le paiement). Différent de
la quittance, qui acte le paiement effectif. OpenQuittance peut
en générer (PDF).

### Avoir

Crédit accordé au locataire (ex. trop-perçu, geste commercial)
qui sera appliqué à la prochaine quittance. Réduit le montant
dû.

## B

### Bail

Contrat de location signé entre bailleur et locataire. Loi
89-462 (logements vides) ou 89-462 art. 25-3 (meublés). Durée
3 ans (vide) ou 1 an (meublé) renouvelable.

### Bailleur

Personne (physique ou morale — SCI, SARL, etc.) qui met un bien
en location. C'est toi, utilisateur principal de l'app.

### Bien

Logement mis en location. Studio, T2, maison, local commercial.
Chaque bien appartient à un bailleur et peut avoir 0 ou 1
locataire actif à la fois.

## C

### Caution / Cautionnement

Personne tierce qui s'engage à payer le loyer si le locataire
fait défaut. Ne pas confondre avec "dépôt de garantie" (souvent
appelé à tort "caution" dans le langage courant).

### Charges

Charges récupérables, c-à-d charges payées par le bailleur mais
remboursables par le locataire (ordures ménagères, entretien
parties communes, eau froide collective, etc.). Décret 87-713.

À distinguer du **loyer hors charges** (loyer "nu").

### Charges récupérables vs non-récupérables

- **Récupérables** : payées par le locataire (cf. ci-dessus).
- **Non-récupérables** : à la charge du bailleur (gros entretien,
  taxe foncière partie bailleur, syndic part bailleur).

OpenQuittance ne gère que les **récupérables** dans le calcul
quittance.

### Clause résolutoire

Clause du bail prévoyant la résiliation automatique en cas de
défaut grave (impayés, troubles de voisinage, défaut d'assurance,
etc.). Activable après commandement de payer.

### Congé

Notification de fin de bail. Locataire : préavis 3 mois (vide)
ou 1 mois (meublé, zone tendue, mutation pro). Bailleur :
préavis 6 mois (motif : vente, reprise, motif légitime/sérieux).

## D

### DDT — Dossier de Diagnostic Technique

Ensemble des diagnostics légaux fournis par le bailleur :
- **DPE** (Diagnostic Performance Énergétique).
- **Amiante** (logement avant 1997).
- **Plomb** (avant 1949).
- **Électricité** (installation > 15 ans).
- **Gaz** (installation > 15 ans).
- **ERP / ERRIAL** (État des Risques et Pollutions).
- **Surface Loi Carrez** (lot copropriété).

OpenQuittance permet d'uploader ces docs sur le bien et de les
partager au locataire via flag "Partage DDT".

### Dépôt de garantie

Somme versée par le locataire à l'entrée (max 1 mois loyer hors
charges en logement vide, 2 mois en meublé). Restituée à la
sortie (sous 1 mois si EDL conformes, 2 mois sinon — loi
89-462 art. 22).

À ne pas confondre avec "caution" (cf. C).

### Document de référence (IRL)

L'indice IRL trimestriel utilisé comme base pour la prochaine
révision. Mis à jour automatiquement à chaque révision dans
OpenQuittance.

### DPE — Diagnostic Performance Énergétique

Note énergétique du logement (A à G). Obligatoire à la mise en
location. Logement G interdit à la location depuis 2025
(passoires énergétiques).

## É

### EDL — État des Lieux

Document décrivant l'état du logement à l'entrée + à la sortie.
Comparaison détermine les éventuelles retenues sur dépôt de
garantie. Obligatoire (loi 89-462 art. 3-2).

OpenQuittance peut générer un template PDF — la signature reste
à faire (papier ou outil tiers signature électronique).

## I

### IRL — Indice de Référence des Loyers

Indice INSEE trimestriel utilisé pour la révision annuelle
légale du loyer. Calcul :
**nouveau loyer = ancien loyer × (IRL nouveau / IRL référence)**

OpenQuittance sync les valeurs IRL depuis l'API INSEE et propose
la révision quand elle devient possible (12 mois après l'entrée
ou la dernière révision).

### INSEE

Institut National de la Statistique et des Études Économiques.
Publie l'IRL trimestriellement. API Bdm-Series exploitée par
OpenQuittance.

## L

### Loyer hors charges (loyer nu)

Le loyer "principal" hors charges. C'est sur ce montant que
porte la révision IRL annuelle.

### Loyer charges comprises

Loyer hors charges + charges. Montant total payé par le
locataire chaque mois. C'est ce qui apparaît sur la quittance.

### LCEN — Loi pour la Confiance dans l'Économie Numérique

Loi 2004-575 art. 6 : oblige les éditeurs de services en ligne
à publier des mentions légales (raison sociale, SIRET,
directeur de publication, hébergeur). OpenQuittance génère
automatiquement ces pages par bailleur.

## P

### Préavis

Délai entre la notification de congé et la sortie effective.
Cf. "Congé".

### Provision sur charges

Montant payé mensuellement par le locataire pour les charges,
en attente de la régularisation annuelle (comparaison avec les
charges réellement payées par le bailleur).

OpenQuittance n'automatise pas la régularisation annuelle en
v3.7 — fait manuellement par le bailleur, à transmettre au
locataire.

## Q

### Quittance de loyer

Document officiel attestant qu'un locataire a payé son loyer
pour un mois donné. Loi 89-462 art. 21 : le bailleur doit la
fournir gratuitement sur demande.

OpenQuittance génère automatiquement les quittances mensuelles
+ envoi par email.

## R

### RGPD — Règlement Général sur la Protection des Données

Règlement UE 2016/679. Encadre le traitement des données
personnelles (collecte, conservation, droits des personnes).
OpenQuittance respecte par défaut (cf.
[RGPD.md](RGPD.md)).

Droits exerçables par le locataire :
- **Accès** (art. 15) : voir ce qui est stocké le concernant.
- **Portabilité** (art. 20) : export ZIP exploitable ailleurs.
- **Rectification** (art. 16) : corriger erreurs.
- **Effacement** (art. 17) : suppression sur demande (sous
  conditions, ex. obligations comptables).

### Révision (de loyer)

Indexation annuelle du loyer hors charges sur l'IRL. Légale
(loi 89-462 art. 17-1) sous condition que la clause de révision
soit présente dans le bail. Pas automatique : le bailleur doit
notifier le locataire (courrier recommandé).

## S

### SCI — Société Civile Immobilière

Structure juridique fréquente pour les bailleurs particuliers
(famille, partenaires) qui détiennent un ou plusieurs biens
en commun. OpenQuittance supporte une SCI = un bailleur, ou
plusieurs SCI sur la même instance (multi-bailleur).

### SIRET

Numéro 14 chiffres identifiant une entreprise + son
établissement. Obligatoire pour SCI / SARL / SAS / Auto-
entrepreneur. Affiché dans les mentions légales.

### Solidarité (clause de)

Clause du bail rendant chaque colocataire responsable de la
totalité du loyer (et non sa quote-part). OpenQuittance ne gère
pas la colocation en v3.7 — chaque colocataire = un locataire
séparé (workaround : créer un Locataire principal "payeur").

## T

### Trimestre IRL

L'IRL est publié 4 fois par an (T1 mars, T2 juin, T3 septembre,
T4 décembre). Le trimestre de référence d'un locataire = celui
en vigueur à la signature du bail. Sert de baseline pour les
révisions futures.

## V

### Vacance locative

Période pendant laquelle un bien est sans locataire (entre 2
baux, ou rénovations). OpenQuittance permet de marquer un bien
"vacant" en passant son locataire en `actif=false` sans en
créer de nouveau.

---

## Acronymes condensés

| Sigle | Sens                                          |
|-------|-----------------------------------------------|
| AR    | Avis de Réception (courrier recommandé)       |
| CAF   | Caisse d'Allocations Familiales (APL)         |
| DDT   | Dossier de Diagnostic Technique               |
| DPE   | Diagnostic Performance Énergétique            |
| EDL   | État Des Lieux                                |
| ERP   | État des Risques et Pollutions                |
| IRL   | Indice de Référence des Loyers                |
| LCEN  | Loi Confiance Économie Numérique              |
| RGPD  | Règlement Général Protection Données          |
| RCS   | Registre du Commerce et des Sociétés          |
| SCI   | Société Civile Immobilière                    |
