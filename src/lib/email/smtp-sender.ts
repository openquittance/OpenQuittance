import nodemailer from 'nodemailer';
import type { Parametres } from '@prisma/client';

export interface SmtpSendArgs {
  parametres: Parametres;
  fromName?: string | null;
  fromEmail: string;
  to: string;
  cc?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  // Phase 1 doc sharing : email léger sans PDF (cf. lib/email/gmail-sender.ts).
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

export async function sendViaSMTP(args: SmtpSendArgs) {
  const { parametres } = args;
  if (!parametres.smtpHost || !parametres.smtpUser || !parametres.smtpPass) {
    throw new Error('Configuration SMTP incomplète');
  }
  const transporter = nodemailer.createTransport({
    host: parametres.smtpHost,
    port: parametres.smtpPort ?? 587,
    secure: (parametres.smtpPort ?? 587) === 465,
    auth: {
      user: parametres.smtpUser,
      pass: parametres.smtpPass,
    },
  });

  const from = args.fromName ? `"${args.fromName}" <${args.fromEmail}>` : args.fromEmail;

  await transporter.sendMail({
    from,
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    text: args.textBody,
    html: args.htmlBody,
    attachments: args.pdfBuffer && args.pdfFilename ? [
      { filename: args.pdfFilename, content: args.pdfBuffer, contentType: 'application/pdf' },
    ] : undefined,
  });
}

export async function sendSmtpTest(parametres: Parametres, to: string) {
  if (!parametres.smtpHost || !parametres.smtpUser || !parametres.smtpPass) {
    throw new Error('Configuration SMTP incomplète');
  }
  const transporter = nodemailer.createTransport({
    host: parametres.smtpHost,
    port: parametres.smtpPort ?? 587,
    secure: (parametres.smtpPort ?? 587) === 465,
    auth: { user: parametres.smtpUser, pass: parametres.smtpPass },
  });
  await transporter.sendMail({
    from: parametres.smtpUser,
    to,
    subject: 'Test SMTP - Quittances',
    text: 'La configuration SMTP fonctionne.',
  });
}
