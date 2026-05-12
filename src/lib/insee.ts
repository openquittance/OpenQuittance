// Client API INSEE pour la récupération automatique de l'Indice de Référence
// des Loyers (série BDM 001763852).
//
// L'INSEE a migré l'API BDM (renommée "Séries Chronologiques") sur
// https://portail-api.insee.fr/ et a basculé sur un plan "Key Less" :
// l'accès est anonyme, aucune clé n'est requise pour la consommation.
//
// La fonction accepte tout de même une clé optionnelle, qui sera envoyée
// dans plusieurs headers de tolérance, au cas où l'INSEE rétablirait
// l'authentification ou pour les plans payants futurs.

const INSEE_BASE = 'https://api.insee.fr';
// Identifiant officiel de la série "Indice de référence des loyers (IRL)" :
// trimestriel, base 100 au T4 1998. Vérifié via TITLE_FR / FREQ=T.
const IRL_SERIES_ID = '001515333';

export interface InseeIRLObservation {
  annee: number;
  trimestre: number;
  valeur: number;
}

/**
 * Construit les headers d'authentification pour l'API INSEE.
 * On envoie plusieurs headers connus pour maximiser la compatibilité avec
 * les différentes générations du portail (legacy OAuth, nouveau portail key).
 */
function buildAuthHeaders(apiKey?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    // SDMX-JSON est le format JSON officiel de la BDM. Sans ça, l'INSEE
    // renvoie du SDMX-XML par défaut (qu'on sait aussi parser, en fallback).
    Accept: 'application/vnd.sdmx.genericdata+json, application/json',
  };
  if (apiKey) {
    h['X-INSEE-Api-Key-Integration'] = apiKey;
    h.apikey = apiKey;
    h.Authorization = `Bearer ${apiKey}`;
  }
  return h;
}

/**
 * Récupère les observations IRL de la série 001763852.
 * Renvoie la liste triée par période croissante.
 * apiKey est optionnel (le plan Key Less de la BDM ne requiert aucune clé).
 */
export async function fetchIRLObservations(apiKey?: string | null): Promise<InseeIRLObservation[]> {
  const url = `${INSEE_BASE}/series/BDM/V1/data/SERIES_BDM/${IRL_SERIES_ID}`;
  const r = await fetch(url, { headers: buildAuthHeaders(apiKey) });
  const body = await r.text();

  if (!r.ok) {
    let hint = '';
    if (r.status === 401 || r.status === 403) {
      hint = ' — clé invalide ou souscription BDM manquante sur https://portail-api.insee.fr/';
    } else if (r.status === 404) {
      hint = ' — URL dépréciée, vérifiez sur https://portail-api.insee.fr/';
    } else if (r.status === 429) {
      hint = ' — limite de débit atteinte, réessayez dans quelques minutes';
    }
    throw new Error(`INSEE BDM ${r.status}${hint}\n${body.slice(0, 300)}`);
  }

  const trimmed = body.trim();
  let obs: InseeIRLObservation[] = [];

  if (trimmed.startsWith('<')) {
    // SDMX-XML : on extrait les Obs avec leurs attributs TIME_PERIOD + OBS_VALUE
    obs = extractObservationsFromXml(trimmed);
    if (obs.length === 0) {
      // Probablement une page d'erreur HTML (clé invalide, souscription absente)
      throw new Error(
        'INSEE a renvoyé une réponse XML/HTML sans données IRL exploitables. '
        + 'Vérifiez que votre clé est valide et que vous êtes bien souscrit '
        + 'à l\'API BDM sur https://portail-api.insee.fr/.\n\n'
        + `Extrait : ${trimmed.slice(0, 200)}…`,
      );
    }
  } else {
    let j: unknown;
    try {
      j = JSON.parse(trimmed);
    } catch {
      throw new Error(`Réponse INSEE non parsable : ${trimmed.slice(0, 200)}`);
    }
    obs = extractObservations(j);
    if (obs.length === 0) {
      throw new Error('Aucune observation IRL extraite de la réponse INSEE — format inattendu.');
    }
  }

  obs.sort((a, b) => (a.annee - b.annee) || (a.trimestre - b.trimestre));
  return obs;
}

/**
 * Test rapide : tente une récupération et retourne la dernière observation.
 */
export async function testInseeConnection(apiKey?: string | null): Promise<{
  latest: InseeIRLObservation;
  totalObservations: number;
}> {
  const obs = await fetchIRLObservations(apiKey);
  const latest = obs[obs.length - 1];
  if (!latest) throw new Error('Aucune observation IRL trouvée');
  return { latest, totalObservations: obs.length };
}

// ─── Parsing défensif ────────────────────────────────────────────────────────

function parsePeriode(periode: string): { annee: number; trimestre: number } | null {
  const m = periode.match(/^(\d{4})[-]?[TQ]?(\d)$/i)
        || periode.match(/^(\d{4})[-]?[TQ](\d)$/i);
  if (!m) return null;
  const annee = parseInt(m[1]!, 10);
  const trimestre = parseInt(m[2]!, 10);
  if (annee < 1990 || annee > 2100 || trimestre < 1 || trimestre > 4) return null;
  return { annee, trimestre };
}

function extractObservations(payload: unknown): InseeIRLObservation[] {
  const out: InseeIRLObservation[] = [];
  const seriesArray = findSeriesArray(payload);
  for (const series of seriesArray) {
    const obs = (series as Record<string, unknown>).Obs;
    if (!Array.isArray(obs)) continue;
    for (const o of obs) {
      const oo = o as Record<string, unknown>;
      const periode = String(oo.TIME_PERIOD ?? oo['@TIME_PERIOD'] ?? '');
      const valStr = String(oo.OBS_VALUE ?? oo['@OBS_VALUE'] ?? '');
      const parsed = parsePeriode(periode);
      const valeur = parseFloat(valStr.replace(',', '.'));
      if (!parsed || !Number.isFinite(valeur)) continue;
      out.push({ ...parsed, valeur });
    }
  }
  return out;
}

/**
 * Parser SDMX-XML minimal. L'INSEE peut renvoyer deux formats principaux :
 *
 * 1) StructureSpecificData : attributs sur <Obs/>
 *    <Obs OBS_VALUE="145.47" TIME_PERIOD="2025-T1"/>
 *
 * 2) GenericData : enfants de <generic:Obs>
 *    <generic:Obs>
 *      <generic:ObsDimension value="2025-T1"/>
 *      <generic:ObsValue value="145.47"/>
 *    </generic:Obs>
 *
 * On gère les deux via deux regex et on dédoublonne par période.
 */
function extractObservationsFromXml(xml: string): InseeIRLObservation[] {
  const seen = new Set<number>();
  const out: InseeIRLObservation[] = [];

  // Format 1 : attributs (StructureSpecificData). Regex non-greedy + [^>] strict.
  const flatRegex = /<(?:\w+:)?Obs\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = flatRegex.exec(xml)) !== null) {
    const attrs = m[1]!;
    const tp = attrs.match(/\bTIME_PERIOD="([^"]+)"/);
    const ov = attrs.match(/\bOBS_VALUE="([^"]+)"/);
    if (!tp || !ov) continue;
    const parsed = parsePeriode(tp[1]!);
    const valeur = parseFloat(ov[1]!.replace(',', '.'));
    if (!parsed || !Number.isFinite(valeur)) continue;
    const key = parsed.annee * 10 + parsed.trimestre;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...parsed, valeur });
  }

  // Format 2 : éléments imbriqués (GenericData)
  const blockRegex = /<(?:\w+:)?Obs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Obs>/g;
  while ((m = blockRegex.exec(xml)) !== null) {
    const inner = m[1]!;
    const tp = inner.match(/<(?:\w+:)?ObsDimension\s+[^>]*\bvalue="([^"]+)"/);
    const ov = inner.match(/<(?:\w+:)?ObsValue\s+[^>]*\bvalue="([^"]+)"/);
    if (!tp || !ov) continue;
    const parsed = parsePeriode(tp[1]!);
    const valeur = parseFloat(ov[1]!.replace(',', '.'));
    if (!parsed || !Number.isFinite(valeur)) continue;
    const key = parsed.annee * 10 + parsed.trimestre;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...parsed, valeur });
  }

  return out;
}

function findSeriesArray(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj.Series)) return obj.Series;
  if (obj.Series && typeof obj.Series === 'object') return [obj.Series];
  for (const k of Object.keys(obj)) {
    const child = obj[k];
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findSeriesArray(item);
        if (found.length > 0) return found;
      }
    } else if (typeof child === 'object') {
      const found = findSeriesArray(child);
      if (found.length > 0) return found;
    }
  }
  return [];
}
