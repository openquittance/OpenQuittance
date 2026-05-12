/**
 * Tests v2.9.1 hotfix — sanitization signature email DOMPurify.
 *
 * Lance : npx tsx tests/dompurify-signature.test.mts
 *
 * T70 : retire <script> + handlers JS d'une signature potentiellement
 *       hostile (admin-only mais pratique propre).
 * T71 : préserve les tags légitimes (a href, strong, img src).
 */

import DOMPurify from 'isomorphic-dompurify';

const SIGNATURE_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'img', 'span', 'div', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'width', 'height', 'class'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpeg|gif|webp);base64,|#|\/)/i,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
};

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function main() {
  // T70 : retire scripts + handlers
  const hostile =
    '<script>alert("XSS")</script>'
    + '<p>Hello</p>'
    + '<img src="x" onerror="alert(1)">'
    + '<a href="javascript:alert(1)">click</a>'
    + '<iframe src="evil.com"></iframe>'
    + '<div onclick="alert(1)">Click div</div>';
  const clean70 = DOMPurify.sanitize(hostile, SIGNATURE_PURIFY_CONFIG);
  const t70ok =
    !clean70.includes('<script')
    && !clean70.includes('onerror')
    && !clean70.includes('onclick')
    && !clean70.includes('javascript:')
    && !clean70.includes('<iframe')
    && clean70.includes('<p>Hello</p>');
  assert(
    'T70 DOMPurify retire <script>, handlers, javascript:, iframe + préserve <p>',
    t70ok,
    `clean=${clean70.slice(0, 200)}`,
  );

  // T71 : préserve tags légitimes
  const legit =
    '<p>Cordialement,</p>'
    + '<p><strong>Jean Dupont</strong> — <em>Gérant</em></p>'
    + '<p>Email : <a href="mailto:contact@example.com">contact@example.com</a></p>'
    + '<p>Tél : <a href="tel:+33123456789">+33 1 23 45 67 89</a></p>'
    + '<img src="https://example.com/logo.png" alt="Logo" width="100">';
  const clean71 = DOMPurify.sanitize(legit, SIGNATURE_PURIFY_CONFIG);
  const t71ok =
    clean71.includes('<strong>Jean Dupont</strong>')
    && clean71.includes('<em>Gérant</em>')
    && clean71.includes('href="mailto:contact@example.com"')
    && clean71.includes('href="tel:+33123456789"')
    && clean71.includes('src="https://example.com/logo.png"')
    && clean71.includes('alt="Logo"');
  assert(
    'T71 DOMPurify préserve <strong>, <em>, <a href mailto:/tel:>, <img src https://>',
    t71ok,
    `clean=${clean71.slice(0, 200)}`,
  );

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v2.9.1 DOMPurify ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v2.9.1 DOMPurify passent.');
}

main();
