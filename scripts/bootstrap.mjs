/**
 * Bootstrap au démarrage container : auto-seed BailleurMembership pour
 * les staff existants sans membership (post-migration v2.4.0).
 *
 * Idempotent. Skippable via SKIP_SEED=1. Erreur silencieuse si Prisma
 * client n'est pas généré encore (premier boot avant migrate).
 *
 * Lancé après `prisma migrate deploy` et avant `node server.js`.
 */

if (process.env.SKIP_SEED === '1') {
  console.log('[bootstrap] SKIP_SEED=1 — seed memberships sauté');
  process.exit(0);
}

let PrismaClient;
try {
  ({ PrismaClient } = await import('@prisma/client'));
} catch (e) {
  console.warn('[bootstrap] Prisma client absent, seed sauté :', e.message);
  process.exit(0);
}

const prisma = new PrismaClient();

try {
  // ─── Étape 0ter : Purge audit logs > 1 an (v2.8.0 quick win sécu) ─────
  // Cap rétention 365 jours par défaut. Override via env AUDIT_LOG_RETENTION_DAYS.
  // Cf. docs/SECURITE-CONFORMITE.md §1.2.3 + §2.3.
  try {
    const days = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? '365', 10);
    if (Number.isFinite(days) && days > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const { count } = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        console.log(`[bootstrap/purge-audit] ${count} entries purged (older than ${days}d)`);
      } else {
        console.log(`[bootstrap/purge-audit] no entries older than ${days}d`);
      }
    }
  } catch (e) {
    console.warn('[bootstrap/purge-audit] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 0sex : Chiffrement uploads AES-256-GCM (v2.9.0) ──────────
  // Migre les fichiers en clair (pré-v2.9) vers le format chiffré
  // "ENC1+IV+tag+ciphertext". Idempotent : skip les fichiers déjà
  // chiffrés. Atomic via tmp + rename.
  //
  // Logique inline (bootstrap tourne en `node` plain, pas tsx — voir
  // src/lib/uploads-crypto.ts pour la source of truth).
  try {
    const crypto = await import('node:crypto');
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const MAGIC = Buffer.from('ENC1', 'ascii');
    const IV_LEN = 12;
    const TAG_LEN = 16;
    const HEADER_LEN = 4 + IV_LEN + TAG_LEN;

    const rawKey = process.env.UPLOADS_ENCRYPTION_KEY;
    if (!rawKey) {
      console.warn(
        '[bootstrap/encrypt-uploads] UPLOADS_ENCRYPTION_KEY absente — '
        + 'migration uploads SAUTÉE. Générer avec : openssl rand -base64 32',
      );
    } else {
      const key = Buffer.from(rawKey, 'base64');
      if (key.length !== 32) {
        console.warn(
          `[bootstrap/encrypt-uploads] UPLOADS_ENCRYPTION_KEY invalide `
          + `(32 bytes attendus, reçu ${key.length}) — migration sautée`,
        );
      } else {
        const isEnc = (buf) => buf.length >= HEADER_LEN && buf.subarray(0, 4).equals(MAGIC);
        const encrypt = (plain) => {
          const iv = crypto.randomBytes(IV_LEN);
          const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
          const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
          const tag = cipher.getAuthTag();
          return Buffer.concat([MAGIC, iv, tag, ct]);
        };
        const uploadsDir = process.env.UPLOADS_DIR
          || path.join(process.cwd(), 'uploads');
        const subdirs = ['archives', 'bailleurs'];
        let migrated = 0;
        let skipped = 0;
        const walk = async (dir) => {
          let entries;
          try {
            entries = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return; // dir absent
          }
          for (const e of entries) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
              await walk(p);
              continue;
            }
            if (!e.isFile()) continue;
            try {
              const buf = await fs.readFile(p);
              if (isEnc(buf)) { skipped++; continue; }
              const enc = encrypt(buf);
              const tmp = `${p}.tmp-enc`;
              await fs.writeFile(tmp, enc);
              await fs.rename(tmp, p);
              migrated++;
            } catch (e) {
              console.warn(`[bootstrap/encrypt-uploads] skip ${p} : ${e?.message ?? e}`);
            }
          }
        };
        for (const sub of subdirs) {
          await walk(path.join(uploadsDir, sub));
        }
        if (migrated === 0 && skipped === 0) {
          console.log('[bootstrap/encrypt-uploads] aucun fichier upload');
        } else {
          console.log(
            `[bootstrap/encrypt-uploads] ${migrated} fichiers chiffrés `
            + `(${skipped} déjà OK)`,
          );
        }
      }
    }
  } catch (e) {
    console.warn('[bootstrap/encrypt-uploads] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 0quater : Migration legacy rcs → siret (v2.8.0-rc3) ───────
  // Refacto cohérence Infos/Légal — l'onglet Légal est la source of
  // truth (siret + raisonSociale + adresseLegale). Les Bailleurs créés
  // pré-v2.8 n'ont que `rcs` (texte libre type "123 456 789 RCS Caen").
  // On extrait le SIREN (9 chiffres consécutifs) et on construit le
  // SIRET avec NIC default "00012" (établissement principal). Idempotent.
  try {
    const candidates = await prisma.bailleur.findMany({
      where: { rcs: { not: null }, siret: null },
      select: { id: true, nom: true, rcs: true, raisonSociale: true },
    });
    let migrated = 0;
    for (const b of candidates) {
      const m = (b.rcs ?? '').match(/\b(\d{3})\s?(\d{3})\s?(\d{3})\b/);
      if (!m) continue;
      const siren = `${m[1]}${m[2]}${m[3]}`;
      const siret = `${siren}00012`;
      await prisma.bailleur.update({
        where: { id: b.id },
        data: {
          siret,
          raisonSociale: b.raisonSociale ?? b.nom,
        },
      });
      migrated++;
    }
    if (migrated > 0) {
      console.log(`[bootstrap/migrate-legal] ${migrated} bailleurs migrés rcs→siret`);
    } else if (candidates.length > 0) {
      console.log(`[bootstrap/migrate-legal] ${candidates.length} candidats sans SIREN extractible`);
    } else {
      console.log('[bootstrap/migrate-legal] aucun bailleur à migrer');
    }
  } catch (e) {
    console.warn('[bootstrap/migrate-legal] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 0 : Désactivation auto portail locataire 5 ans après sortie ─
  // Phase 3 : tout Locataire dont dateSortie remonte à plus de 5 ans
  // se voit portailActif=false (le compte reste en DB pour audit, juste
  // l'accès au portail est coupé). Idempotent.
  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 5);
    const expired = await prisma.locataire.updateMany({
      where: {
        portailActif: true,
        dateSortie: { not: null, lt: cutoff },
      },
      data: { portailActif: false },
    });
    if (expired.count > 0) {
      console.log(`[bootstrap/expire-portail] ${expired.count} locataire(s) avec dateSortie > 5 ans → portailActif=false`);
    } else {
      console.log('[bootstrap/expire-portail] aucun locataire à désactiver');
    }
  } catch (e) {
    console.warn('[bootstrap/expire-portail] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 0bis : Migration catégories Archive (v2.5.0 Feature A) ────
  // Idempotent. Aligne les catégories sur la whitelist canonique
  // (src/lib/archive-categories.ts — source of truth). Les aliases Phase 1
  // sont mappés 1:1 ; le texte libre passe par regex ; les DPE/diagnostics
  // mal-attribués sur ownerType=Locataire sont migrés vers le Bien parent
  // via locataire.bienId (Q6 cadrage).
  //
  // Duplication TS→JS volontaire : bootstrap.mjs tourne via `node` plain
  // (pas tsx) en prod, et la logique est one-shot + idempotente après
  // déploiement v2.5.0. Source de vérité = lib TS, garder synchro à la main
  // si mappings évoluent.
  try {
    const BIEN_CATS = new Set([
      'ACTE_VENTE', 'CREDIT_IMMO', 'TAXE_FONCIERE',
      'DPE', 'DIAG_AMIANTE', 'DIAG_ELEC', 'DIAG_GAZ', 'DIAG_PLOMB', 'ERP',
      'ASSURANCE_PNO', 'GLI',
      'COPRO_REGLEMENT', 'COPRO_AG', 'COPRO_QUITTANCE_SYNDIC',
      'IMPOTS_IR', 'IMPOTS_IFI', 'AUTRE_BIEN',
    ]);
    const LOC_CATS = new Set([
      'BAIL', 'EDL_ENTREE', 'EDL_SORTIE',
      'COURRIER_REVISION_IRL', 'PREUVE_DEPOT_RECOMMANDE',
      'ASSURANCE_LOCATAIRE', 'GARANTIE_LOYER', 'AUTRE_LOCATAIRE',
    ]);
    const LEGACY_ALIASES = {
      'edl-entree': 'EDL_ENTREE',
      'edl-sortie': 'EDL_SORTIE',
      bail: 'BAIL',
      contrat: 'BAIL',
      'courrier-revision-irl': 'COURRIER_REVISION_IRL',
      'preuve-depot-recommande': 'PREUVE_DEPOT_RECOMMANDE',
    };
    const REGEX = [
      [/\bdpe\b/i, 'DPE', 'Bien'],
      [/amiante/i, 'DIAG_AMIANTE', 'Bien'],
      [/\b(elec|electric)/i, 'DIAG_ELEC', 'Bien'],
      [/\bgaz\b/i, 'DIAG_GAZ', 'Bien'],
      [/plomb/i, 'DIAG_PLOMB', 'Bien'],
      [/\berp\b|risq.*pollu|pollu.*risq/i, 'ERP', 'Bien'],
      [/acte.*vente|vente.*acte/i, 'ACTE_VENTE', 'Bien'],
      [/credit|emprunt|\bpret\b/i, 'CREDIT_IMMO', 'Bien'],
      [/taxe.*fonci/i, 'TAXE_FONCIERE', 'Bien'],
      [/\bpno\b|prop.*non.*occ/i, 'ASSURANCE_PNO', 'Bien'],
      [/\bgli\b|loyer.*impay/i, 'GLI', 'Bien'],
      [/reglement.*copro|copro.*reglement/i, 'COPRO_REGLEMENT', 'Bien'],
      [/\b(ag|assemblee)\b.*copro|copro.*\b(ag|assemblee)\b|proces.*verbal/i, 'COPRO_AG', 'Bien'],
      [/syndic/i, 'COPRO_QUITTANCE_SYNDIC', 'Bien'],
      [/impot.*revenu|\birp?\b.*revenu|2042/i, 'IMPOTS_IR', 'Bien'],
      [/\bifi\b|fortune.*immo|immo.*fortune/i, 'IMPOTS_IFI', 'Bien'],
      [/\bbail\b|contrat.*loc/i, 'BAIL', 'Locataire'],
      [/edl.*entr|etat.*lieux.*entr|entree.*etat/i, 'EDL_ENTREE', 'Locataire'],
      [/edl.*sort|etat.*lieux.*sort|sortie.*etat/i, 'EDL_SORTIE', 'Locataire'],
      [/revision.*irl|courrier.*revis|irl.*courrier/i, 'COURRIER_REVISION_IRL', 'Locataire'],
      [/recommand|depot.*post/i, 'PREUVE_DEPOT_RECOMMANDE', 'Locataire'],
      [/\bvisale\b|garant|caution/i, 'GARANTIE_LOYER', 'Locataire'],
      [/assur.*habit|assur.*loc|attest.*assur/i, 'ASSURANCE_LOCATAIRE', 'Locataire'],
    ];
    const isValid = (ot, c) => (ot === 'Bien' ? BIEN_CATS.has(c) : LOC_CATS.has(c));
    const decide = (ownerType, category, filename) => {
      if (category && (BIEN_CATS.has(category) || LOC_CATS.has(category))) {
        return isValid(ownerType, category)
          ? { category }
          : { category: ownerType === 'Bien' ? 'AUTRE_BIEN' : 'AUTRE_LOCATAIRE' };
      }
      const aliased = category ? LEGACY_ALIASES[category] : null;
      if (aliased) {
        return isValid(ownerType, aliased)
          ? { category: aliased }
          : { category: ownerType === 'Bien' ? 'AUTRE_BIEN' : 'AUTRE_LOCATAIRE' };
      }
      const haystack = `${category ?? ''} ${filename}`;
      for (const [pattern, cat, hint] of REGEX) {
        if (!pattern.test(haystack)) continue;
        if (hint === 'Bien' && ownerType === 'Locataire') {
          return { category: cat, newOwnerType: 'Bien' };
        }
        if (isValid(ownerType, cat)) return { category: cat };
        break;
      }
      return { category: ownerType === 'Bien' ? 'AUTRE_BIEN' : 'AUTRE_LOCATAIRE' };
    };

    const archives = await prisma.archive.findMany({
      select: { id: true, ownerType: true, ownerId: true, category: true, filename: true },
    });
    const stats = { total: archives.length, migrated: 0, flippedToBien: 0, byCategory: {}, ambiguous: 0 };
    for (const a of archives) {
      // Si déjà canonique pour ce ownerType, skip (idempotent)
      if (a.category && isValid(a.ownerType, a.category)) continue;
      const decision = decide(a.ownerType, a.category, a.filename);
      const update = { category: decision.category };
      if (decision.newOwnerType === 'Bien' && a.ownerType === 'Locataire') {
        // Q6 : résoudre bienId via le locataire d'origine
        const loc = await prisma.locataire.findUnique({
          where: { id: a.ownerId }, select: { bienId: true },
        });
        if (loc?.bienId) {
          update.ownerType = 'Bien';
          update.ownerId = loc.bienId;
          stats.flippedToBien++;
        } else {
          // Locataire introuvable (orphan) — fallback AUTRE_LOCATAIRE
          update.category = 'AUTRE_LOCATAIRE';
          stats.ambiguous++;
        }
      }
      await prisma.archive.update({ where: { id: a.id }, data: update });
      stats.migrated++;
      stats.byCategory[update.category] = (stats.byCategory[update.category] ?? 0) + 1;
    }
    if (stats.total === 0) {
      console.log('[bootstrap/archive-cats] aucune archive en DB, migration skip');
    } else if (stats.migrated === 0) {
      console.log(`[bootstrap/archive-cats] ${stats.total} archive(s) déjà canoniques, no-op`);
    } else {
      const breakdown = Object.entries(stats.byCategory)
        .map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(
        `[bootstrap/archive-cats] ${stats.migrated}/${stats.total} migrée(s)`
        + ` (flip→Bien=${stats.flippedToBien}, ambigus=${stats.ambiguous}) : ${breakdown}`,
      );
    }
  } catch (e) {
    console.warn('[bootstrap/archive-cats] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 1 : Sanitize héritage corruption rc1/rc2 ──────────────────
  // Source of truth : `Locataire.tenantUserId`. Tout user lié à un
  // Locataire DOIT avoir role='TENANT' et 0 BailleurMembership. La faille
  // rc1/rc2 (PATCH admin promouvant TENANT → staff + bootstrap qui
  // créait des memberships) laissait un état incohérent en DB. rc3
  // empêche les nouvelles corruptions, rc4 nettoie les anciennes.
  // Idempotent : no-op si DB clean.
  try {
    const corrupted = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
        locatairesAccessibles: { some: {} },
      },
      select: { id: true, email: true, role: true },
    });
    if (corrupted.length > 0) {
      for (const u of corrupted) {
        console.log(`[bootstrap/sanitize] ${u.email} (role=${u.role}) → restore TENANT + purge memberships`);
      }
      const ids = corrupted.map(u => u.id);
      const purged = await prisma.bailleurMembership.deleteMany({
        where: { userId: { in: ids } },
      });
      await prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { role: 'TENANT' },
      });
      console.log(`[bootstrap/sanitize] ${corrupted.length} user(s) corrompu(s) restaurés en TENANT, ${purged.count} membership(s) purgée(s)`);
    } else {
      console.log('[bootstrap/sanitize] aucun user corrompu');
    }
  } catch (e) {
    console.warn('[bootstrap/sanitize] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 1ter : Migration v3.1.0-rc10 — Drive OAuth credentials ───
  // .env → DB. Si AppConfig.googleDriveClientId null mais
  // process.env.GOOGLE_DRIVE_CLIENT_ID défini, on copie en DB chiffré
  // enc:v1:. Idempotent : skip si DB déjà rempli. Sans ça, l'utilisateur
  // perd sa config Drive .env existante après upgrade rc9 → rc10.
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
    if (cfg && !cfg.googleDriveClientId && !cfg.googleDriveClientSecret
      && process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
      const secret = process.env.ENCRYPTION_SECRET;
      if (!secret || secret.length < 16) {
        console.warn('[bootstrap/drive-migrate] ENCRYPTION_SECRET manquant, skip migration .env → DB');
      } else {
        // Inline AES-256-GCM enc:v1: (même format que src/lib/crypto.ts).
        const crypto = await import('node:crypto');
        const key = crypto.createHash('sha256').update(secret).digest();
        const encryptFn = (plain) => {
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
          const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
          const tag = cipher.getAuthTag();
          return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
        };
        await prisma.appConfig.update({
          where: { id: 'singleton' },
          data: {
            googleDriveClientId: encryptFn(process.env.GOOGLE_DRIVE_CLIENT_ID),
            googleDriveClientSecret: encryptFn(process.env.GOOGLE_DRIVE_CLIENT_SECRET),
          },
        });
        console.log('[bootstrap/drive-migrate] credentials Google Drive .env → DB (chiffrés enc:v1:)');
      }
    }
  } catch (e) {
    console.warn('[bootstrap/drive-migrate] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 1quater : Migration v3.2.0-rc1 — Google OAuth credentials ──
  // .env → DB. Si AppConfig.googleClientId null mais
  // process.env.GOOGLE_CLIENT_ID défini, copie en DB chiffré enc:v1:.
  // Idempotent : skip si DB déjà rempli OU process.env vide. Permet
  // upgrade transparent v3.1.0 → v3.2.0 pour les users existants
  // (Google login + Gmail API).
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
    if (cfg && !cfg.googleClientId && !cfg.googleClientSecret
      && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const secret = process.env.ENCRYPTION_SECRET;
      if (!secret || secret.length < 16) {
        console.warn('[bootstrap/google-oauth-migrate] ENCRYPTION_SECRET manquant, skip migration .env → DB');
      } else {
        // Inline AES-256-GCM enc:v1: (même format que src/lib/crypto.ts).
        const crypto = await import('node:crypto');
        const key = crypto.createHash('sha256').update(secret).digest();
        const encryptFn = (plain) => {
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
          const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
          const tag = cipher.getAuthTag();
          return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
        };
        await prisma.appConfig.update({
          where: { id: 'singleton' },
          data: {
            googleClientId: encryptFn(process.env.GOOGLE_CLIENT_ID),
            googleClientSecret: encryptFn(process.env.GOOGLE_CLIENT_SECRET),
          },
        });
        console.log('[bootstrap/google-oauth-migrate] credentials Google OAuth .env → DB (chiffrés enc:v1:)');
      }
    }
  } catch (e) {
    console.warn('[bootstrap/google-oauth-migrate] error (non-bloquant) :', e?.message ?? e);
  }

  // ─── Étape 2 : Seed memberships pour staff orphelins ─────────────────
  // Si la table n'existe pas encore (migrate pas appliqué), Prisma throw
  // → on skip silencieusement.
  const orphans = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      disabledAt: null,
      memberships: { none: {} },
      // Defense in depth (rc3) : exclure tout user lié à un Locataire via
      // tenantUserId. Si un TENANT est promu MEMBER en DB par accident
      // (raw SQL, bug futur, etc.), le bootstrap ne lui crée PAS de
      // memberships. Évite l'escalade par interaction admin + reboot.
      locatairesAccessibles: { none: {} },
    },
    select: { id: true, email: true, role: true },
  });
  if (orphans.length === 0) {
    console.log('[bootstrap] aucun staff orphelin, seed memberships skip');
    await prisma.$disconnect();
    process.exit(0);
  }

  const bailleurs = await prisma.bailleur.findMany({ select: { id: true } });
  if (bailleurs.length === 0) {
    console.log('[bootstrap] aucun bailleur en DB, seed memberships skip');
    await prisma.$disconnect();
    process.exit(0);
  }

  let created = 0;
  for (const u of orphans) {
    for (const b of bailleurs) {
      try {
        await prisma.bailleurMembership.create({
          data: { userId: u.id, bailleurId: b.id, role: u.role },
        });
        created++;
      } catch (e) {
        if (e?.code !== 'P2002') throw e;
      }
    }
  }
  console.log(`[bootstrap] seed memberships : ${created} créées pour ${orphans.length} staff orphelin(s) × ${bailleurs.length} bailleur(s)`);
} catch (e) {
  console.warn('[bootstrap] seed memberships error (non-bloquant) :', e?.message ?? e);
} finally {
  await prisma.$disconnect();
}
