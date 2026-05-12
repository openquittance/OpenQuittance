/**
 * Layout commun aux pages légales (mentions / politique RGPD).
 * SSR-friendly (server component compatible — pas de hooks).
 * v2.8.0 Vague 2.
 */
import Link from 'next/link';
import type { LegalSection } from '@/lib/legal-pages';
import { LogoIcon } from '@/components/Logo';

export default function LegalPageView({
  bailleurNom,
  pageTitle,
  sections,
  backHref,
  backLabel,
}: {
  bailleurNom: string;
  pageTitle: string;
  sections: LegalSection[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{bailleurNom}</p>
        <h1 className="text-2xl font-semibold">{pageTitle}</h1>
      </div>
      <div className="space-y-6">
        {sections.map((s, i) => (
          <section key={i} className="space-y-2">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.content}</p>
          </section>
        ))}
      </div>
      {backHref && (
        <div className="pt-4 border-t border-border">
          <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
            ← {backLabel ?? 'Retour'}
          </Link>
        </div>
      )}
      {/* v3.7.0 — footer logo discret en bas des pages légales publiques. */}
      <footer className="pt-6 mt-6 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
        <LogoIcon className="h-6 w-6 text-muted-foreground" />
        <span>Propulsé par OpenQuittance</span>
      </footer>
    </div>
  );
}
