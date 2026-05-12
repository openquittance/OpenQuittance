function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function encodeAddress(displayName: string | null | undefined, email: string): string {
  if (!displayName) return email;
  const encoded = encodeHeader(displayName);
  return /[",@<>:;]/.test(displayName)
    ? `"${encoded}" <${email}>`
    : `${encoded} <${email}>`;
}

interface BuildArgs {
  fromName?: string | null;
  fromEmail: string;
  to: string;
  cc?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  attachment?: { filename: string; data: Buffer; mimeType: string };
}

function chunkBase64(b64: string, lineLength = 76): string {
  const re = new RegExp(`.{1,${lineLength}}`, 'g');
  return b64.match(re)?.join('\r\n') ?? b64;
}

export function buildMimeMessage(args: BuildArgs): string {
  const headers: string[] = [];
  headers.push(`From: ${encodeAddress(args.fromName, args.fromEmail)}`);
  headers.push(`To: ${args.to}`);
  if (args.cc) headers.push(`Cc: ${args.cc}`);
  headers.push(`Subject: ${encodeHeader(args.subject)}`);
  headers.push('MIME-Version: 1.0');

  const textPart = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(args.textBody, 'utf8').toString('base64')),
  ].join('\r\n');

  let bodyPart: string;

  if (args.htmlBody) {
    const altBoundary = `alt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const htmlPart = [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      chunkBase64(Buffer.from(args.htmlBody, 'utf8').toString('base64')),
    ].join('\r\n');

    bodyPart = [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      textPart,
      `--${altBoundary}`,
      htmlPart,
      `--${altBoundary}--`,
    ].join('\r\n');
  } else {
    bodyPart = textPart;
  }

  if (args.attachment) {
    const mixedBoundary = `mix_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    const attachmentPart = [
      `Content-Type: ${args.attachment.mimeType}; name="${args.attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${args.attachment.filename}"`,
      '',
      chunkBase64(args.attachment.data.toString('base64')),
    ].join('\r\n');

    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

    return [
      headers.join('\r\n'),
      '',
      `--${mixedBoundary}`,
      bodyPart,
      `--${mixedBoundary}`,
      attachmentPart,
      `--${mixedBoundary}--`,
    ].join('\r\n');
  }

  if (args.htmlBody) {
    // body part already declares its own Content-Type header
    return [
      headers.join('\r\n'),
      bodyPart,
    ].join('\r\n');
  }

  // simple text-only message
  headers.push('Content-Type: text/plain; charset=UTF-8');
  headers.push('Content-Transfer-Encoding: base64');
  return [
    headers.join('\r\n'),
    '',
    chunkBase64(Buffer.from(args.textBody, 'utf8').toString('base64')),
  ].join('\r\n');
}

export function toGmailRaw(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
