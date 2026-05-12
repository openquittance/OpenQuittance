'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Mail, Users, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/Modal';
import { useBailleurs } from '@/lib/bailleur-context';
import { formatDateFr } from '@/lib/utils';

type Role = 'ADMIN' | 'MEMBER' | 'VIEWER';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
  VIEWER: 'Lecteur',
};
const ROLE_DESC: Record<Role, string> = {
  ADMIN: 'Tout pouvoir sur ce bailleur, peut gérer les autres membres',
  MEMBER: 'Peut créer/modifier biens, locataires, quittances',
  VIEWER: 'Consultation uniquement',
};

interface MembershipRow {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  totpEnabled: boolean;
  disabled: boolean;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: Role;
  bailleurIds: string[];
  expiresAt: string;
  createdAt: string;
}

interface SessionMembership { bailleurId: string; role: Role }

function Content() {
  const { data: session } = useSession();
  const { active, bailleurs } = useBailleurs();
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const me = session?.user;
  const myMembs = (me as { memberships?: SessionMembership[] } | undefined)?.memberships ?? [];
  const isAdminOnActive = active && myMembs.some(m => m.bailleurId === active.id && m.role === 'ADMIN');

  const load = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([
        fetch(`/api/admin/memberships?bailleurId=${active.id}`),
        fetch('/api/admin/invitations'),
      ]);
      if (m.ok) {
        const j = await m.json();
        setMemberships(j.memberships ?? []);
      } else {
        setMemberships([]);
      }
      if (i.ok) {
        const list = await i.json();
        // Filtre les invitations qui concernent au moins le bailleur actif
        setInvitations((list as Invitation[]).filter(inv => inv.bailleurIds?.includes(active.id)));
      } else {
        setInvitations([]);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active?.id]);

  if (!active) {
    return (
      <div className="card text-center space-y-3 py-12 max-w-md mx-auto">
        <Users className="mx-auto text-muted-foreground" size={32} />
        <h1 className="text-xl font-semibold">Sélectionnez un bailleur</h1>
        <p className="text-sm text-muted-foreground">
          Les membres sont gérés par bailleur. Sélectionnez un bailleur dans la barre latérale.
        </p>
      </div>
    );
  }

  if (!isAdminOnActive) {
    return (
      <div className="card text-center space-y-3 py-12 max-w-md mx-auto">
        <AlertTriangle className="mx-auto text-amber-600" size={32} />
        <h1 className="text-xl font-semibold">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">
          Vous devez être ADMIN sur <strong>{active.nom}</strong> pour gérer ses membres.
        </p>
      </div>
    );
  }

  const updateRole = async (userId: string, role: Role) => {
    const r = await fetch(`/api/admin/memberships/${userId}/${active.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Rôle mis à jour');
    load();
  };

  const deleteMembership = async (m: MembershipRow) => {
    if (!confirm(
      `Retirer ${m.email} du bailleur ${active.nom} ?\n\n` +
      `Le compte de l'utilisateur reste actif (autres bailleurs).`,
    )) return;
    const r = await fetch(`/api/admin/memberships/${m.userId}/${active.id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Membership retirée');
    load();
  };

  const cancelInvitation = async (inv: Invitation) => {
    if (!confirm(`Annuler l'invitation de ${inv.email} ?`)) return;
    const r = await fetch(`/api/admin/invitations/${inv.id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Invitation annulée');
    load();
  };

  const resendInvitation = async (inv: Invitation) => {
    const r = await fetch(`/api/admin/invitations/${inv.id}`, { method: 'POST' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success(`Invitation renvoyée à ${inv.email}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Users /> Membres</h1>
          <p className="text-sm text-muted-foreground">
            Membres de <strong>{active.nom}</strong>. Switch via le sélecteur de bailleur.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite(true)}>
          <Plus size={16} /> Ajouter un membre
        </button>
      </div>

      {loading ? <p className="text-muted-foreground">Chargement…</p> : (
        <>
          {/* Desktop ≥ md : table */}
          <div className="hidden md:block card p-0 overflow-hidden">
            <table className="table-base">
              <thead>
                <tr><th>Utilisateur</th><th>Email</th><th>Rôle sur ce bailleur</th><th>Membre depuis</th><th></th></tr>
              </thead>
              <tbody>
                {memberships.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                    Aucun membre. Cliquez « Ajouter un membre » pour commencer.
                  </td></tr>
                ) : memberships.map(m => (
                  <tr key={m.userId}>
                    <td className="font-medium">
                      {m.name || '—'}
                      {m.userId === me?.id && <span className="text-xs text-muted-foreground ml-1">(vous)</span>}
                      {m.disabled && <span className="text-xs text-amber-600 ml-1">(désactivé)</span>}
                    </td>
                    <td>{m.email}</td>
                    <td>
                      {m.userId === me?.id ? (
                        <span className="badge bg-primary/10 text-primary">{ROLE_LABEL[m.role]}</span>
                      ) : (
                        <select
                          className="text-xs rounded border border-border bg-card px-2 py-1"
                          value={m.role}
                          onChange={e => updateRole(m.userId, e.target.value as Role)}
                        >
                          {(['ADMIN', 'MEMBER', 'VIEWER'] as Role[]).map(r => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="text-xs">{formatDateFr(m.createdAt)}</td>
                    <td className="text-right">
                      {m.userId !== me?.id && (
                        <button
                          title={`Retirer du bailleur ${active.nom}`}
                          className="btn-ghost text-destructive"
                          onClick={() => deleteMembership(m)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* v3.6.2 mobile < md : cards */}
          <ul className="md:hidden space-y-3">
            {memberships.length === 0 ? (
              <li className="card text-center text-muted-foreground text-sm">
                Aucun membre. Cliquez « Ajouter un membre » pour commencer.
              </li>
            ) : memberships.map(m => (
              <li key={m.userId} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {m.name || '—'}
                      {m.userId === me?.id && <span className="text-xs text-muted-foreground ml-1">(vous)</span>}
                      {m.disabled && <span className="text-xs text-amber-600 ml-1">(désactivé)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Membre depuis {formatDateFr(m.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.userId === me?.id ? (
                    <span className="badge bg-primary/10 text-primary">{ROLE_LABEL[m.role]}</span>
                  ) : (
                    <select
                      className="flex-1 text-xs rounded border border-border bg-card px-2 py-1"
                      value={m.role}
                      onChange={e => updateRole(m.userId, e.target.value as Role)}
                    >
                      {(['ADMIN', 'MEMBER', 'VIEWER'] as Role[]).map(r => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  )}
                  {m.userId !== me?.id && (
                    <button
                      title={`Retirer du bailleur ${active.nom}`}
                      className="btn-secondary text-xs text-destructive"
                      onClick={() => deleteMembership(m)}
                    >
                      <Trash2 size={14} /> Retirer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {invitations.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-sm text-muted-foreground">
                Invitations en attente sur {active.nom}
              </h2>
              {/* Desktop ≥ md : table */}
              <div className="hidden md:block card p-0 overflow-hidden">
                <table className="table-base">
                  <thead>
                    <tr><th>Email</th><th>Rôle</th><th>Bailleurs</th><th>Expire le</th><th></th></tr>
                  </thead>
                  <tbody>
                    {invitations.map(inv => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td><span className="badge bg-muted text-foreground">{ROLE_LABEL[inv.role]}</span></td>
                        <td className="text-xs text-muted-foreground">
                          {inv.bailleurIds.length === 1
                            ? bailleurs.find(b => b.id === inv.bailleurIds[0])?.nom ?? '—'
                            : `${inv.bailleurIds.length} bailleurs`}
                        </td>
                        <td className="text-xs">{formatDateFr(inv.expiresAt)}</td>
                        <td className="text-right whitespace-nowrap">
                          <button title="Renvoyer l'email" className="btn-ghost" onClick={() => resendInvitation(inv)}>
                            <RefreshCw size={14} />
                          </button>
                          <button title="Annuler" className="btn-ghost text-destructive" onClick={() => cancelInvitation(inv)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* v3.6.2 mobile < md : cards */}
              <ul className="md:hidden space-y-3">
                {invitations.map(inv => (
                  <li key={inv.id} className="card space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{inv.email}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {inv.bailleurIds.length === 1
                            ? bailleurs.find(b => b.id === inv.bailleurIds[0])?.nom ?? '—'
                            : `${inv.bailleurIds.length} bailleurs`}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Expire {formatDateFr(inv.expiresAt)}</p>
                      </div>
                      <span className="badge bg-muted text-foreground shrink-0">{ROLE_LABEL[inv.role]}</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary flex-1 text-xs" onClick={() => resendInvitation(inv)}>
                        <RefreshCw size={14} /> Renvoyer
                      </button>
                      <button className="btn-secondary flex-1 text-xs text-destructive" onClick={() => cancelInvitation(inv)}>
                        <Trash2 size={14} /> Annuler
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {showInvite && active && (
        <InviteModal
          activeBailleur={active}
          adminBailleurs={bailleurs.filter(b =>
            myMembs.some(m => m.bailleurId === b.id && m.role === 'ADMIN'),
          )}
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); load(); }}
        />
      )}
    </div>
  );
}

interface BailleurLite { id: string; nom: string }

function InviteModal({
  activeBailleur,
  adminBailleurs,
  onClose,
  onDone,
}: {
  activeBailleur: BailleurLite;
  adminBailleurs: BailleurLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  // Bailleur actif forcément coché et non décochable.
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  // Phase 3 : config email du caller pour banner adaptatif "envoi vs lien manuel"
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  // Si la response contient un lien d'invitation à copier-coller, on l'affiche
  // dans une modale dédiée (cas pas de SMTP/Gmail OU send fail).
  const [linkResult, setLinkResult] = useState<{ link: string; warning?: string; sent: boolean } | null>(null);

  useEffect(() => {
    // /api/parametres GET strip les secrets (gmailRefreshToken, smtpPass)
    // pour ne pas les exposer au client. Utilise les flags `gmailConnected`
    // et `smtpPassConfigured` retournés à la place.
    fetch('/api/parametres')
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (!p) { setEmailConfigured(false); return; }
        const ok = (p.emailMethod === 'gmail_api' && p.gmailConnected)
                || (p.emailMethod === 'smtp' && p.smtpUser && p.smtpPassConfigured);
        setEmailConfigured(!!ok);
      })
      .catch(() => setEmailConfigured(false));
  }, []);

  const otherAdminBailleurs = adminBailleurs.filter(b => b.id !== activeBailleur.id);

  const submit = async () => {
    if (!email) { toast.error('Email requis'); return; }
    setSending(true);
    try {
      const bailleurIds = [activeBailleur.id, ...Array.from(extraIds)];
      const r = await fetch('/api/admin/memberships', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || null, role, bailleurIds }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          toast.error(j.error, { description: 'Conflit : utilisez la corbeille pour retirer puis ré-ajouter, ou changez le rôle.' });
        } else if (r.status === 403) {
          toast.error(j.error, { description: 'Vous n\'êtes pas ADMIN sur tous les bailleurs sélectionnés.' });
        } else {
          toast.error(j.error || 'Erreur');
        }
        return;
      }
      if (j.mode === 'membership_added') {
        toast.success(`${email} ajouté au(x) bailleur(s)`);
        onDone();
        return;
      }
      // Modes invitation_* : on affiche le lien (avec ou sans envoi email)
      if (j.invitationLink) {
        setLinkResult({
          link: j.invitationLink,
          warning: j.warning,
          sent: j.mode === 'invitation_sent',
        });
        return;
      }
      // Fallback toast si pas de link (ne devrait pas arriver post-Phase 3)
      toast.success(`Invitation créée pour ${email}`);
      onDone();
    } finally { setSending(false); }
  };

  // Vue post-submit : affiche le lien d'activation à copier-coller
  // (même pattern que l'ancien tempPassword UX).
  if (linkResult) {
    return (
      <Modal open onClose={() => { setLinkResult(null); onDone(); }}
        title={linkResult.sent ? 'Invitation envoyée + lien de secours' : "Lien d'activation à transmettre"}
        maxWidth="max-w-lg">
        <div className="space-y-4">
          {linkResult.warning && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded">
              <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
              <p className="text-sm">{linkResult.warning}</p>
            </div>
          )}
          {!linkResult.sent && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
              <AlertTriangle size={20} className="shrink-0 text-blue-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Email non configuré</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Copiez ce lien et transmettez-le au membre par votre canal habituel
                  (téléphone, messagerie, etc.). Le lien est valide 14 jours.
                </p>
              </div>
            </div>
          )}
          <div>
            <label className="label">Lien d'activation</label>
            <input
              className="input font-mono text-xs select-all"
              value={linkResult.link}
              readOnly
              onFocus={e => e.currentTarget.select()}
            />
            <button
              type="button"
              className="text-xs text-primary hover:underline mt-1"
              onClick={() => {
                navigator.clipboard.writeText(linkResult.link);
                toast.success('Lien copié');
              }}
            >
              Copier dans le presse-papiers
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <button className="btn-primary" onClick={() => { setLinkResult(null); onDone(); }}>
              {linkResult.sent ? 'Fermer' : "J'ai noté le lien"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Ajouter un membre" maxWidth="max-w-lg">
      <div className="space-y-4">
        {emailConfigured === false && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <AlertTriangle size={18} className="shrink-0 text-blue-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Email non configuré</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pour les emails inconnus, l'app affichera un lien d'activation à
                copier-coller (à transmettre au membre par votre canal habituel).
                Configurez votre email dans <em>Paramètres → Email</em> pour envoyer
                l'invitation automatiquement.
              </p>
            </div>
          </div>
        )}
        <div>
          <label className="label">Email *</label>
          <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="adresse@example.com" />
          <p className="text-xs text-muted-foreground mt-1">
            Si la personne a déjà un compte sur Quittances, elle est ajoutée
            tout de suite. Sinon, elle reçoit un email d'invitation (ou un lien
            à transmettre manuellement si tu n'as pas configuré l'envoi d'email).
          </p>
        </div>
        <div>
          <label className="label">Nom (optionnel)</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Jean Dupont" />
        </div>

        <div>
          <label className="label">Rôle</label>
          <div className="space-y-2">
            {(['ADMIN', 'MEMBER', 'VIEWER'] as Role[]).map(r => (
              <label key={r} className={`block p-3 rounded-md border cursor-pointer ${role === r ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="role" className="mr-2" checked={role === r} onChange={() => setRole(r)} />
                <span className="font-medium">{ROLE_LABEL[r]}</span>
                <p className="text-xs text-muted-foreground ml-5 mt-1">{ROLE_DESC[r]}</p>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Donner accès à</label>
          <div className="space-y-1.5 border border-border rounded p-3 bg-muted/30">
            {/* Bailleur actif : coché et désactivé */}
            <label className="flex items-center gap-2 text-sm opacity-75 cursor-not-allowed" title="Bailleur actif (toujours inclus)">
              <input type="checkbox" checked disabled />
              <span className="font-medium">{activeBailleur.nom}</span>
              <span className="text-xs text-muted-foreground">(bailleur actif)</span>
            </label>
            {otherAdminBailleurs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-6">
                Vous n'êtes ADMIN sur aucun autre bailleur.
              </p>
            ) : (
              otherAdminBailleurs.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extraIds.has(b.id)}
                    onChange={e => {
                      const next = new Set(extraIds);
                      if (e.target.checked) next.add(b.id);
                      else next.delete(b.id);
                      setExtraIds(next);
                    }}
                  />
                  <span>{b.nom}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={sending}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={sending || !email}>
            <Mail size={14} /> {sending ? 'Envoi…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Page() {
  return <AppShell><Content /></AppShell>;
}
