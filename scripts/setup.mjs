#!/usr/bin/env node
/**
 * OpenQuittance setup wizard interactif (v3.0).
 *
 * Usage : npm run setup  OU  node scripts/setup.mjs
 *
 * Prompts utilisateur via readline, génère secrets via crypto, écrit
 * .env atomic, lance docker compose up -d --build. Pour les non-tech
 * (Synology / VPS) : zéro éditeur de texte requis.
 */

import { randomBytes } from 'node:crypto';
import { readFile, writeFile, access, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';

const ENV_PATH = path.resolve('.env');
const ENV_EXAMPLE = path.resolve('.env.example');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

function log(msg) { console.log(msg); }
function info(msg) { log(`${C.cyan}→${C.reset} ${msg}`); }
function ok(msg) { log(`${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { log(`${C.yellow}⚠${C.reset}  ${msg}`); }
function err(msg) { log(`${C.red}✗${C.reset} ${msg}`); }
function header(msg) { log(`\n${C.bold}${C.blue}${msg}${C.reset}\n`); }

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q, def = '') => {
  const suffix = def ? `${C.dim} [${def}]${C.reset}` : '';
  const a = (await rl.question(`${q}${suffix} `)).trim();
  return a || def;
};
const askYes = async (q, def = true) => {
  const a = await ask(`${q} (${def ? 'O/n' : 'o/N'})`, def ? 'O' : 'N');
  return /^o|^y/i.test(a);
};

function genSecret(bytes = 32, encoding = 'hex') {
  return randomBytes(bytes).toString(encoding);
}

function isValidUrl(s) {
  try { new URL(s); return true; } catch { return false; }
}

async function checkDocker() {
  return new Promise(resolve => {
    const proc = spawn('docker', ['--version'], { stdio: 'pipe' });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function runDockerUp() {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['compose', 'up', '-d', '--build'], { stdio: 'inherit' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`docker compose exit ${code}`)));
    proc.on('error', reject);
  });
}

async function main() {
  header('OpenQuittance — Setup wizard');
  log(`${C.dim}Application open source de gestion locative pour la France.${C.reset}`);
  log(`${C.dim}Génère votre .env, sauvegarde les secrets, lance Docker.${C.reset}\n`);

  // ─── 1. Vérif Docker ──────────────────────────────────────────────────
  info('Vérification de Docker…');
  const dockerOk = await checkDocker();
  if (!dockerOk) {
    err('Docker n\'est pas installé ou pas dans le PATH.');
    log('  Installez Docker Desktop : https://docs.docker.com/get-docker/');
    process.exit(1);
  }
  ok('Docker détecté');

  // ─── 2. Vérif .env existant ───────────────────────────────────────────
  if (existsSync(ENV_PATH)) {
    warn('Un fichier .env existe déjà.');
    const overwrite = await askYes('Le ré-écrire ? (un backup .env.bak sera créé)', false);
    if (!overwrite) {
      log('  Annulé. Setup non effectué.');
      rl.close();
      process.exit(0);
    }
    await rename(ENV_PATH, `${ENV_PATH}.bak`);
    ok('Ancien .env sauvegardé en .env.bak');
  }

  // ─── 3. Prompts variables ─────────────────────────────────────────────
  header('Configuration');
  let nextauthUrl = '';
  while (!isValidUrl(nextauthUrl)) {
    nextauthUrl = await ask(
      `URL publique de l'app (ex: https://quittances.example.fr ou http://localhost:3800)`,
      'http://localhost:3800',
    );
    if (!isValidUrl(nextauthUrl)) err('URL invalide.');
  }

  log(`\n${C.dim}Google OAuth (optionnel — login Google + envoi via Gmail API)${C.reset}`);
  log(`${C.dim}Laisser vide pour skip. Configurable plus tard via .env.${C.reset}`);
  const googleClientId = await ask('GOOGLE_CLIENT_ID');
  const googleClientSecret = googleClientId
    ? await ask('GOOGLE_CLIENT_SECRET')
    : '';

  log(`\n${C.dim}INSEE BDM (optionnel — clé non requise par défaut, l'API est key-less)${C.reset}`);
  const inseeKey = await ask('INSEE_API_KEY (laisser vide)', '');

  // ─── 4. Génération secrets ────────────────────────────────────────────
  header('Génération des secrets');
  const nextauthSecret = genSecret(32, 'hex');
  const encryptionSecret = genSecret(32, 'hex');
  const uploadsKey = genSecret(32, 'base64');
  ok('NEXTAUTH_SECRET (64 hex)');
  ok('ENCRYPTION_SECRET (64 hex)');
  ok('UPLOADS_ENCRYPTION_KEY (32 bytes base64)');

  // ─── 5. Construction .env ─────────────────────────────────────────────
  const envContent = [
    '# OpenQuittance — généré par scripts/setup.mjs',
    `# Date : ${new Date().toISOString()}`,
    '',
    '# ─── Database ───',
    'DATABASE_URL=postgresql://quittances:password@db:5432/quittances',
    '',
    '# ─── Auth ───',
    `NEXTAUTH_URL=${nextauthUrl}`,
    `NEXTAUTH_SECRET=${nextauthSecret}`,
    '',
    '# ─── Chiffrement données sensibles (Gmail tokens, TOTP secret) ───',
    `ENCRYPTION_SECRET=${encryptionSecret}`,
    '',
    '# ─── Chiffrement uploads (logos, archives) ───',
    `UPLOADS_ENCRYPTION_KEY=${uploadsKey}`,
    '',
    '# ─── Google OAuth (login Google + Gmail API) ───',
    `GOOGLE_CLIENT_ID=${googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
    '',
    '# ─── INSEE BDM (révision IRL) ───',
    `INSEE_API_KEY=${inseeKey}`,
    '',
    '# ─── Stockage local ───',
    'UPLOADS_DIR=/app/uploads',
    '',
  ].join('\n');

  const envTmp = `${ENV_PATH}.tmp`;
  await writeFile(envTmp, envContent, { mode: 0o600 });
  await rename(envTmp, ENV_PATH);
  ok(`.env écrit (${ENV_PATH})`);

  // ─── 6. Warning sauvegarde clés ───────────────────────────────────────
  header('⚠️  IMPORTANT — Sauvegarde des secrets');
  log(`${C.yellow}Sauvegardez ces deux clés en lieu sûr (1Password, Bitwarden,`);
  log(`${C.yellow}coffre-fort papier, etc.) AVANT de continuer :${C.reset}\n`);
  log(`  ${C.bold}ENCRYPTION_SECRET${C.reset}     = ${encryptionSecret}`);
  log(`  ${C.bold}UPLOADS_ENCRYPTION_KEY${C.reset} = ${uploadsKey}\n`);
  log(`${C.red}Si vous perdez UPLOADS_ENCRYPTION_KEY, tous les uploads chiffrés${C.reset}`);
  log(`${C.red}deviennent IRRÉCUPÉRABLES. Pas de master key, pas de back-door.${C.reset}\n`);
  await ask('Appuyez sur Entrée pour confirmer que vous avez sauvegardé les clés…');

  // ─── 7. Lancer Docker ─────────────────────────────────────────────────
  const launch = await askYes('\nLancer docker compose up -d --build maintenant ?', true);
  if (launch) {
    header('Build & démarrage');
    try {
      await runDockerUp();
      ok('Containers lancés');
    } catch (e) {
      err(`docker compose a échoué : ${e.message}`);
      err('Vous pouvez réessayer manuellement : docker compose up -d --build');
      rl.close();
      process.exit(2);
    }
  } else {
    info('Skip docker compose. Pour lancer plus tard : docker compose up -d --build');
  }

  // ─── 8. Final ─────────────────────────────────────────────────────────
  header('✓ Setup terminé');
  log(`OpenQuittance disponible sur : ${C.green}${nextauthUrl}${C.reset}`);
  log(`Premier utilisateur inscrit → devient ADMIN automatiquement.`);
  log(`\nDocs : https://github.com/grx14/quittances-app#readme`);
  rl.close();
}

main().catch(e => {
  err(`Erreur fatale : ${e.message}`);
  rl.close();
  process.exit(1);
});
