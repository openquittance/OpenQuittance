'use client';

import { useEffect } from 'react';
import { signIn } from 'next-auth/react';

/**
 * Client Component qui consomme le token via signIn('magic-link') côté
 * client (signIn() pose les cookies de session). Redirige vers /portail.
 *
 * Ne fait rien si le token est invalide/expiré/consumed (la page parent
 * SSR a déjà rendu l'UI d'erreur). Ce composant est monté uniquement
 * dans le cas 'valid'.
 */
export default function VerifyClient({ token }: { token: string }) {
  useEffect(() => {
    signIn('magic-link', { token, redirect: true, callbackUrl: '/portail' });
  }, [token]);

  return (
    <div className="text-center py-10 space-y-2">
      <p className="font-medium">Connexion en cours…</p>
      <p className="text-sm text-muted-foreground">
        Vous allez être redirigé vers votre espace.
      </p>
    </div>
  );
}
