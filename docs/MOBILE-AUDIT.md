# Mobile responsive audit — v3.6.0 (Vague B)

Audit des pages staff pour rendu mobile (320-768px). Le portail
locataire (`/portail/*`) est déjà responsive depuis Lot C v2.x — non
audité ici.

## Pages auditées

| Page | Élément problématique | Statut |
|------|------------------------|--------|
| `/` (Dashboard) | Cards grid responsive déjà | ✅ |
| `/bailleurs` | `<table>` avec couleur/logo/actions | 🔧 cards mobile |
| `/biens` | `<table>` avec bailleur/adresse/type | 🔧 cards mobile |
| `/locataires` | `<table>` avec bien/loyer/email | 🔧 cards mobile |
| `/quittances` | `<table>` avec mois/montant/statut | 🔧 cards mobile |
| `/documents` | Section pills + détails | 🔧 vérif pills wrap |
| `/exports` | Boutons download | ✅ déjà OK |
| `/parametres/membres` | `<table>` avec user/rôle/bailleurs | 🔧 cards mobile |
| `/parametres/backup` | `BackupHistory` table 7 colonnes | 🔧 cards mobile |
| `/parametres/irl` | Form révisions IRL | 🔧 vérif |
| `/parametres/email` | Form Gmail/SMTP | ✅ form vertical déjà |
| `/parametres/admin` | Toggle simple | ✅ |
| `/parametres/integrations` | Card Google OAuth | ✅ |
| `/parametres/apparence` | Grid 2 cols → 1 col déjà | ✅ |
| Sidebar | Drawer mobile + hamburger | ✅ déjà OK |

## Modales

| Modale | Statut |
|--------|--------|
| BailleurForm | 🔧 max-w-2xl → full-screen mobile |
| BienForm | 🔧 idem |
| LocataireForm | 🔧 idem |
| QuittanceForm | 🔧 idem |
| RevisionIRLForm | 🔧 idem |
| Modal détail BackupHistory | 🔧 idem |

## Pattern recommandé

**Tables → cards mobile** :
```tsx
<div className="hidden md:block">
  <table>...</table>
</div>
<div className="md:hidden space-y-2">
  {items.map(i => (
    <div key={i.id} className="card">
      <div className="flex justify-between">
        <strong>{i.nom}</strong>
        <span>{i.statut}</span>
      </div>
      <p className="text-sm text-muted-foreground">{i.sous-info}</p>
      <div className="flex gap-2 mt-2">{actions}</div>
    </div>
  ))}
</div>
```

**Modales full-screen mobile** :
```tsx
<div className="fixed inset-0 z-50 bg-background sm:bg-black/50
                sm:flex sm:items-center sm:justify-center sm:p-4">
  <div className="h-full sm:h-auto sm:max-h-[90vh] sm:max-w-2xl
                  sm:rounded-lg overflow-y-auto">
    ...
  </div>
</div>
```

## Statut consolidé

- Session 3 (audit) : ✅ ce fichier
- Session 4 (tables → cards) : 🔧 en cours
- Session 5 (modales + forms) : 🔧 prévu
- Session 6 (polish + GA) : 🔧 prévu
