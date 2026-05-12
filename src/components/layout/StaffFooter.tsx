'use client';

/**
 * Footer staff — liens pages légales du bailleur actif (v2.8.0 Vague 2).
 * Slug calculé client-side depuis active.nom (cohérent avec lib/legal-pages).
 */
import Link from 'next/link';
import { useBailleurs } from '@/lib/bailleur-context';

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sans-nom';
}

export default function StaffFooter() {
  const { active } = useBailleurs();
  if (!active) return null;
  const slug = slugify(active.nom);
  return (
    <footer className="mt-8 pt-4 border-t border-border text-xs text-muted-foreground flex flex-wrap gap-3 justify-center">
      <Link href={`/mentions-legales/${slug}`} className="hover:text-foreground">
        Mentions légales
      </Link>
      <span>·</span>
      <Link href={`/politique-confidentialite/${slug}`} className="hover:text-foreground">
        Politique de confidentialité
      </Link>
      <span>·</span>
      <span>{active.nom}</span>
    </footer>
  );
}
