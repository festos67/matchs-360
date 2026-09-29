/**
 * @component ClubAdminDelegationPanel
 * @description Délégation temporaire des droits du responsable de club
 *              (maladie, congés) à un membre adulte du club.
 * @features
 *  - Titulaire : bouton « Déléguer mes droits », liste des délégations,
 *    « Retirer » à tout moment
 *  - Délégué : bandeau rappelant la période, « Mettre fin » possible
 *  - Les règles (adulte, membre du club, 3 mois au plus, titulaire seul)
 *    sont appliquées côté base (create_club_admin_delegation) ; la liste des
 *    candidats n'est qu'un préfiltre.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserCog, Loader2 } from "lucide-react";

export interface DelegationCandidateSource {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status: string;
  roles: { role: string; club_id: string | null }[];
  team_memberships: { member_type: string; is_active: boolean }[];
  profile?: { birthdate?: string | null } | null;
}

interface Delegation {
  id: string;
  delegate_id: string;
  delegate_name: string;
  delegator_name: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  revoked_at: string | null;
  status: "active" | "planned" | "ended" | "revoked";
}

// 92 jours côté base, mesurés à la seconde : la fin (23 h 59, incluse)
// d'une période de 91 jours reste en deçà.
const MAX_DAYS = 91;

const ERROR_MESSAGES: Record<string, string> = {
  DELEGATION_TITULAR_ONLY: "Seul le responsable titulaire du club peut déléguer ses droits.",
  DELEGATION_INVALID_DELEGATE: "Cette personne ne peut pas recevoir la délégation.",
  DELEGATION_INVALID_PERIOD: "Période invalide : la fin doit suivre le début, 3 mois au plus.",
  DELEGATION_MINOR_FORBIDDEN: "Impossible de déléguer à un mineur.",
  DELEGATION_NOT_CLUB_MEMBER: "La personne doit être coach ou joueur d'une équipe du club.",
  DELEGATION_AGE_UNKNOWN: "Date de naissance inconnue : impossible de vérifier que ce joueur est majeur.",
  DELEGATION_ALREADY_CLUB_ADMIN: "Cette personne est déjà responsable du club.",
  DELEGATION_ALREADY_EXISTS: "Une délégation est déjà prévue ou en cours pour cette personne.",
};

function errorMessage(error: { message?: string } | null): string {
  const msg = error?.message ?? "";
  const key = Object.keys(ERROR_MESSAGES).find((k) => msg.includes(k));
  return key ? ERROR_MESSAGES[key] : "La délégation n'a pas pu être enregistrée.";
}

function isAdult(birthdate: string | null | undefined): boolean | null {
  if (!birthdate) return null;
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return new Date(birthdate) <= limit;
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

const STATUS_LABEL: Record<Delegation["status"], string> = {
  active: "En cours",
  planned: "Prévue",
  ended: "Terminée",
  revoked: "Retirée",
};

interface Props {
  clubId: string;
  currentUserId: string | null;
  users: DelegationCandidateSource[];
}

export function ClubAdminDelegationPanel({ clubId, currentUserId, users }: Props) {
  const [kind, setKind] = useState<"titular" | "delegate" | "none" | null>(null);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [open, setOpen] = useState(false);
  const [delegateId, setDelegateId] = useState("");
  const [startDate, setStartDate] = useState(() => toDateInput(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toDateInput(d);
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [kindRes, listRes] = await Promise.all([
      supabase.rpc("get_my_club_admin_kind" as never, { _club_id: clubId } as never),
      supabase.rpc("get_club_admin_delegations" as never, { _club_id: clubId } as never),
    ]);
    if (kindRes.error) console.error("delegation kind fetch failed", kindRes.error);
    else setKind(kindRes.data as unknown as "titular" | "delegate" | "none");
    if (listRes.error) console.error("delegations fetch failed", listRes.error);
    else setDelegations((listRes.data ?? []) as unknown as Delegation[]);
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const candidates = useMemo(
    () =>
      users
        .filter((u) => u.id !== currentUserId && u.status !== "Suspendu")
        .filter((u) => !u.roles.some((r) => r.role === "club_admin" && r.club_id === clubId))
        .map((u) => {
          const active = u.team_memberships.filter((m) => m.is_active);
          const isCoach = active.some((m) => m.member_type === "coach");
          const isPlayer = active.some((m) => m.member_type === "player");
          const adult = isAdult(u.profile?.birthdate);
          const eligible = (isCoach || isPlayer) && adult !== false && (adult === true || isCoach);
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;
          return { id: u.id, name, isCoach, eligible };
        })
        .filter((c) => c.eligible)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [users, currentUserId, clubId],
  );

  const myDelegation = delegations.find(
    (d) => d.delegate_id === currentUserId && (d.status === "active" || d.status === "planned"),
  );

  const maxEnd = useMemo(() => {
    const d = new Date(startDate || new Date());
    d.setDate(d.getDate() + MAX_DAYS);
    return toDateInput(d);
  }, [startDate]);

  const submit = async () => {
    if (!delegateId) {
      toast.error("Choisissez la personne qui vous remplace.");
      return;
    }
    const today = toDateInput(new Date());
    // Début aujourd'hui = effet immédiat ; sinon à minuit (heure locale).
    const starts = startDate === today ? new Date() : new Date(`${startDate}T00:00:00`);
    // Fin incluse : jusqu'au soir du dernier jour.
    const ends = new Date(`${endDate}T23:59:59`);
    setSaving(true);
    const { error } = await supabase.rpc(
      "create_club_admin_delegation" as never,
      {
        _club_id: clubId,
        _delegate_id: delegateId,
        _starts_at: starts.toISOString(),
        _ends_at: ends.toISOString(),
        _reason: reason.trim() || null,
      } as never,
    );
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Délégation enregistrée. La personne est prévenue par une notification.");
    setOpen(false);
    setDelegateId("");
    setReason("");
    load();
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    const { error } = await supabase.rpc("revoke_club_admin_delegation" as never, { _delegation_id: id } as never);
    setRevokingId(null);
    if (error) {
      toast.error("La délégation n'a pas pu être retirée.");
      return;
    }
    toast.success("Délégation retirée.");
    if (id === myDelegation?.id) {
      // Le délégué perd ses droits : retour au choix du profil.
      window.location.assign("/dashboard");
      return;
    }
    load();
  };

  if (kind === "delegate" && myDelegation) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <UserCog className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm flex-1">
          Vous remplacez {myDelegation.delegator_name ?? "le responsable du club"} jusqu'au{" "}
          <strong>{fmt(myDelegation.ends_at)}</strong>. Vous ne pouvez ni nommer ni retirer un
          responsable de club.
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={revokingId === myDelegation.id}
          onClick={() => revoke(myDelegation.id)}
        >
          Mettre fin à la délégation
        </Button>
      </div>
    );
  }

  if (kind !== "titular") return null;

  const visible = delegations.filter((d) => d.status === "active" || d.status === "planned");

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="font-semibold flex items-center gap-2">
            <UserCog className="w-4 h-4 text-primary" />
            Délégation de mes droits
          </h2>
          <p className="text-sm text-muted-foreground">
            En cas d'absence (maladie, congés), confiez vos droits de responsable à un coach ou
            à un joueur majeur du club, pour 3 mois au plus.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Déléguer mes droits
        </Button>
      </div>

      {visible.length > 0 && (
        <ul className="divide-y rounded-md border">
          {visible.map((d) => (
            <li key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 text-sm">
              <div className="flex-1 min-w-0">
                <span className="font-medium">{d.delegate_name}</span>{" "}
                <span className="text-muted-foreground">
                  du {fmt(d.starts_at)} au {fmt(d.ends_at)}
                  {d.reason ? ` — ${d.reason}` : ""}
                </span>
              </div>
              <Badge variant={d.status === "active" ? "default" : "secondary"}>{STATUS_LABEL[d.status]}</Badge>
              <Button
                variant="outline"
                size="sm"
                disabled={revokingId === d.id}
                onClick={() => revoke(d.id)}
              >
                Retirer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Déléguer mes droits de responsable</DialogTitle>
            <DialogDescription>
              La personne choisie aura les mêmes droits que vous sur le club pendant la période,
              sauf nommer ou retirer un responsable. Vous gardez vos droits et pouvez retirer la
              délégation à tout moment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Remplaçant</Label>
              <Select value={delegateId} onValueChange={setDelegateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un membre du club" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Aucun coach ni joueur majeur disponible.
                    </div>
                  )}
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.isCoach ? "(coach)" : "(joueur)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Les mineurs et les supporters ne peuvent pas recevoir la délégation.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="delegation-start">Du</Label>
                <Input
                  id="delegation-start"
                  type="date"
                  value={startDate}
                  min={toDateInput(new Date())}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delegation-end">Au (inclus)</Label>
                <Input
                  id="delegation-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={maxEnd}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delegation-reason">Motif (facultatif)</Label>
              <Input
                id="delegation-reason"
                value={reason}
                maxLength={200}
                placeholder="Congés, arrêt maladie…"
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Déléguer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
