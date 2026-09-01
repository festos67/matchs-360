/**
 * @page ClubUsers
 * @route /club/users
 *
 * Console de gestion utilisateurs réservée aux Club Admins.
 * (mem://features/club-admin/user-management, mem://features/user-management/club-admin-filters)
 *
 * @description
 * Variante restreinte de /admin/users : ne montre que les utilisateurs rattachés
 * au club du Club Admin courant. Filtrage côté client par équipe et type d'utilisateur.
 *
 * @features
 * - Filtres : équipe, rôle, recherche full-text
 * - Édition utilisateur (EditUserModal)
 * - Actions Super Admin masquées (promotion, reset password)
 *
 * @access Club Admin uniquement (ProtectedRoute + filtre club_id côté requête)
 *
 * @maintenance
 * Les actions sensibles (promotion Super Admin) sont strictement bloquées même
 * si l'UI les exposait par erreur — sécurité côté edge function.
 */
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { EditUserModal } from "@/components/modals/EditUserModal";
import {
  Shield,
  Search,
  CheckCircle,
  Trash2,
  Edit,
  RefreshCw,
  RotateCcw,
  Mail,
  MailWarning,
  KeyRound,
  Users,
  Clock,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_MIN_LENGTH, ADMIN_PASSWORD_HELP_TEXT, validateAdminPassword } from "@/lib/password-policy";
import { PARENTAL_CONSENT_AGE_YEARS, requiresParentalConsent } from "@/lib/age-policy";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserRole {
  id: string;
  role: string;
  club_id: string | null;
  club_name: string | null;
}

interface TeamMembership {
  id: string;
  team_id: string;
  team_name: string;
  club_name: string;
  member_type: string;
  coach_role: string | null;
  is_active: boolean;
}

interface SupporterLink {
  id: string;
  player_id: string;
  player_name: string;
}

interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  club_id: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  deleted_at: string | null;
  status: "Actif" | "Invité" | "Suspendu";
  roles: UserRole[];
  team_memberships: TeamMembership[];
  supporter_links: SupporterLink[];
  /**
   * Profil brut renvoyé par l'edge function admin-users (`select("*")`).
   * La donnée arrivait déjà ; seul le type ne la déclarait pas. On n'expose
   * ici que `birthdate`, nécessaire au filtre par âge.
   */
  profile?: { birthdate?: string | null } | null;
}

/** État du consentement parental, par identifiant de joueur mineur. */
type GuardianStatus =
  | { kind: "signed"; consentId: string; revokedAt: string | null; photo: boolean; selfEval: boolean }
  | { kind: "pending" };

const roleColors: Record<string, string> = {
  admin: "bg-destructive text-destructive-foreground",
  club_admin: "bg-blue-500 text-white",
  coach: "bg-green-500 text-white",
  player: "bg-orange-500 text-white",
  supporter: "bg-purple-500 text-white",
};

const statusColors: Record<string, string> = {
  Actif: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Invité: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  Suspendu: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

/**
 * Colonne « Responsable légal ».
 *
 * N'a de sens que pour un joueur soumis au consentement parental (< 15 ans).
 * Pour les autres, un tiret : afficher « aucun représentant » sur un majeur
 * ferait passer une situation normale pour une anomalie.
 *
 * Quatre états pour un mineur concerné : validé (cliquable → attestation),
 * révoqué (cliquable, l'attestation porte la mention du retrait), en attente,
 * et aucun représentant désigné — ce dernier étant une anomalie de conformité
 * (compte créé sans que personne n'ait été sollicité).
 */
function GuardianCell({
  birthdate,
  status,
  isPlayer,
}: {
  birthdate: string | null;
  status: GuardianStatus | undefined;
  isPlayer: boolean;
}) {
  if (!birthdate) {
    // L'absence de date n'est signalée que sur un JOUEUR : c'est là qu'elle
    // empêche de savoir si le consentement parental s'applique. Sur un coach
    // ou un supporter, elle est sans conséquence — l'alerter noierait les
    // vrais cas (la majorité des profils du club n'ont pas de date).
    if (!isPlayer) return <span className="text-muted-foreground">—</span>;
    return (
      <span className="text-xs text-amber-600 dark:text-amber-500 whitespace-nowrap">
        Date de naissance inconnue
      </span>
    );
  }

  if (!requiresParentalConsent(birthdate)) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (!status) {
    return (
      <Badge variant="destructive" className="font-normal whitespace-nowrap">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Aucun représentant
      </Badge>
    );
  }

  if (status.kind === "pending") {
    return (
      <Badge
        variant="secondary"
        className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 font-normal whitespace-nowrap"
      >
        <Clock className="w-3 h-3 mr-1" />
        En attente
      </Badge>
    );
  }

  return (
    <Link
      to={`/consent/${status.consentId}/attestation`}
      className="inline-flex flex-col gap-1 group"
      title="Ouvrir l'attestation"
    >
      {status.revokedAt ? (
        <Badge variant="destructive" className="font-normal whitespace-nowrap w-fit">
          <ShieldOff className="w-3 h-3 mr-1" />
          Révoqué
        </Badge>
      ) : (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 font-normal whitespace-nowrap w-fit group-hover:underline"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Validé
        </Badge>
      )}
      {!status.revokedAt && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Photo : {status.photo ? "oui" : "non"} · Auto-éval :{" "}
          {status.selfEval ? "oui" : "non"}
        </span>
      )}
    </Link>
  );
}

export default function ClubUsers() {
  const { currentRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [roleTypeFilter, setRoleTypeFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [guardianByPlayer, setGuardianByPlayer] = useState<Map<string, GuardianStatus>>(new Map());

  const isClubAdmin = currentRole?.role === "club_admin";
  const clubId = currentRole?.club_id ?? null;

  useEffect(() => {
    if (!authLoading && !isClubAdmin) {
      toast.error("Accès non autorisé");
      navigate("/dashboard");
    }
  }, [isClubAdmin, authLoading, navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
        {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch users");
      }

      const data = await response.json();
      setUsers(data.users);
    } catch (error: unknown) {
      console.error("Error fetching users:", error);
      toast.error(error instanceof Error ? error.message : "Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isClubAdmin) {
      fetchUsers();
    }
  }, [isClubAdmin]);

  /**
   * État du consentement parental pour tous les mineurs du club, en DEUX
   * requêtes (pas une par ligne) :
   *  - consentements signés via get_club_parental_consents (RLS : la table
   *    parental_consents n'est lisible ni par le club ni par le coach)
   *  - demandes encore en attente via guardian_designations, que la policy
   *    « Staff and minor read guardian designation » ouvre au club_admin
   * Un mineur absent des deux n'a AUCUN représentant désigné : anomalie de
   * conformité que le club doit voir, d'où un troisième état explicite.
   */
  useEffect(() => {
    if (!isClubAdmin || !clubId) return;
    let cancelled = false;
    (async () => {
      const [consentsRes, desigRes] = await Promise.all([
        supabase.rpc("get_club_parental_consents" as never, { _club_id: clubId } as never),
        supabase
          .from("guardian_designations")
          .select("minor_profile_id, status")
          .eq("status", "pending"),
      ]);
      if (cancelled) return;

      const map = new Map<string, GuardianStatus>();

      // Les demandes en attente d'abord : un consentement signé les écrase.
      for (const d of (desigRes.data ?? []) as { minor_profile_id: string }[]) {
        map.set(d.minor_profile_id, { kind: "pending" });
      }

      type ConsentRow = {
        consent_id: string;
        minor_id: string;
        revoked_at: string | null;
        photo_consent_at: string | null;
        self_eval_consent_at: string | null;
      };
      for (const c of (consentsRes.data ?? []) as ConsentRow[]) {
        map.set(c.minor_id, {
          kind: "signed",
          consentId: c.consent_id,
          revokedAt: c.revoked_at,
          photo: c.photo_consent_at !== null,
          selfEval: c.self_eval_consent_at !== null,
        });
      }

      if (consentsRes.error) console.error("club consents fetch failed", consentsRes.error);
      if (desigRes.error) console.error("guardian designations fetch failed", desigRes.error);
      setGuardianByPlayer(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [isClubAdmin, clubId]);

  const callAdminAction = async (action: string, payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Action failed");
    }

    return response.json();
  };

  const handleForceValidate = async (user: AdminUser) => {
    try {
      setActionLoading(user.id);
      await callAdminAction("force-validate", { userId: user.id });
      toast.success(`Email validé pour ${user.email}`);
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la validation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSoftDelete = async (user: AdminUser) => {
    try {
      setActionLoading(user.id);
      await callAdminAction("soft-delete", { userId: user.id });
      toast.success(`Utilisateur ${user.email} suspendu`);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suspension");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (user: AdminUser) => {
    try {
      setActionLoading(user.id);
      await callAdminAction("restore", { userId: user.id });
      toast.success(`Utilisateur ${user.email} réactivé`);
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la réactivation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResendInvitation = async (user: AdminUser) => {
    try {
      setActionLoading(user.id);
      const result = await callAdminAction("resend-invitation", { 
        userId: user.id, 
        email: user.email,
        clubId: user.club_id 
      });
      if (result.emailSent) {
        toast.success(`Invitation renvoyée à ${user.email}`);
      } else {
        toast.warning("Invitation générée mais l'email n'a pas pu être envoyé");
      }
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renvoi de l'invitation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (targetUser: AdminUser) => {
    const pwdError = validateAdminPassword(newPassword);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }
    try {
      setActionLoading(targetUser.id);
      await callAdminAction("update-password", { userId: targetUser.id, newPassword });
      toast.success(`Mot de passe réinitialisé pour ${getUserDisplayName(targetUser)}`);
      setResetPasswordUser(null);
      setNewPassword("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la réinitialisation");
    } finally {
      setActionLoading(null);
    }
  };

  const getUserDisplayName = (user: AdminUser) => {
    if (user.nickname) return user.nickname;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.email.split("@")[0];
  };

  const uniqueTeams = Array.from(
    new Map(
      users.flatMap(u => u.team_memberships.filter(m => m.is_active).map(m => [m.team_id, m.team_name]))
    ).entries()
  ).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchLower || 
      user.email.toLowerCase().includes(searchLower) ||
      user.first_name?.toLowerCase().includes(searchLower) ||
      user.last_name?.toLowerCase().includes(searchLower) ||
      user.nickname?.toLowerCase().includes(searchLower);

    const matchesTeam = teamFilter === "all" || 
      user.team_memberships.some(m => m.team_id === teamFilter && m.is_active);

    const matchesRoleType = roleTypeFilter === "all" ||
      (roleTypeFilter === "club_admin" && user.roles.some(r => r.role === "club_admin")) ||
      (roleTypeFilter === "coach" && user.team_memberships.some(m => m.member_type === "coach" && m.is_active)) ||
      (roleTypeFilter === "player" && user.team_memberships.some(m => m.member_type === "player" && m.is_active)) ||
      (roleTypeFilter === "supporter" && user.roles.some(r => r.role === "supporter"));

    // Âge. « missing » est une entrée à part entière et non un oubli : une
    // part notable des profils n'a pas de date de naissance, et sans elle on
    // ne peut pas savoir si le consentement parental s'applique. Les ranger
    // silencieusement avec les majeurs ferait passer des mineurs sous le
    // radar ; les masquer les rendrait introuvables.
    const birthdate = user.profile?.birthdate ?? null;
    const matchesAge =
      ageFilter === "all" ||
      (ageFilter === "minor" && !!birthdate && requiresParentalConsent(birthdate)) ||
      (ageFilter === "adult" && !!birthdate && !requiresParentalConsent(birthdate)) ||
      (ageFilter === "missing" && !birthdate);

    return matchesSearch && matchesTeam && matchesRoleType && matchesAge;
  });

  const missingBirthdateCount = users.filter((u) => !u.profile?.birthdate).length;

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!isClubAdmin) {
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Gestion des Utilisateurs
              </h1>
              <p className="text-muted-foreground">
                Utilisateurs rattachés au club
              </p>
            </div>
          </div>
          <Button onClick={fetchUsers} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un utilisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Toutes les équipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {uniqueTeams.map(team => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleTypeFilter} onValueChange={setRoleTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tous les types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="club_admin">Responsable club</SelectItem>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="player">Joueur</SelectItem>
              <SelectItem value="supporter">Supporter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ageFilter} onValueChange={setAgeFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tous les âges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les âges</SelectItem>
              <SelectItem value="minor">
                Moins de {PARENTAL_CONSENT_AGE_YEARS} ans
              </SelectItem>
              <SelectItem value="adult">
                {PARENTAL_CONSENT_AGE_YEARS} ans et plus
              </SelectItem>
              <SelectItem value="missing">Date de naissance manquante</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{users.length} utilisateurs au total</span>
          <span>•</span>
          <span>{users.filter((u) => u.status === "Actif").length} actifs</span>
          <span>•</span>
          <span>{users.filter((u) => u.status === "Invité").length} invités</span>
          <span>•</span>
          <span>{users.filter((u) => u.status === "Suspendu").length} suspendus</span>
          {missingBirthdateCount > 0 && (
            <>
              <span>•</span>
              <button
                type="button"
                onClick={() => setAgeFilter("missing")}
                className="text-amber-600 dark:text-amber-500 hover:underline"
              >
                {missingBirthdateCount} sans date de naissance
              </button>
            </>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[21%]">Identité</TableHead>
                <TableHead className="w-[21%]">Rôles</TableHead>
                <TableHead className="w-[11%]">Email</TableHead>
                <TableHead className="w-[15%]">Responsable légal</TableHead>
                <TableHead className="w-[8%]">Statut</TableHead>
                <TableHead className="text-right w-[24%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div
                      className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-1.5 -m-1.5 transition-colors"
                      onClick={() => setEditingUser(user)}
                    >
                      <div className="shrink-0 w-10 h-10">
                        <CircleAvatar
                          shape="circle"
                          imageUrl={user.photo_url}
                          name={getUserDisplayName(user)}
                          size="sm"
                          showName={false}
                          className="[&>div:first-child]:w-10 [&>div:first-child]:h-10"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate max-w-[180px]">{getUserDisplayName(user)}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-[180px]">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge
                          key={role.id}
                          className={roleColors[role.role] || ""}
                          variant="secondary"
                        >
                          {role.role}
                          {role.club_name && ` (${role.club_name})`}
                        </Badge>
                      ))}
                      {user.team_memberships
                        .filter((m) => m.is_active)
                        .map((membership) => (
                          <Badge
                            key={membership.id}
                            variant="outline"
                            className="text-xs"
                          >
                            {membership.member_type === "coach" ? "🏋️" : "⚽"}{" "}
                            {membership.team_name}
                          </Badge>
                        ))}
                      {user.roles.length === 0 &&
                        user.team_memberships.filter((m) => m.is_active).length === 0 && (
                          <span className="text-muted-foreground text-sm">
                            Aucun rôle
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.email_confirmed_at ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap" variant="secondary">
                        <Mail className="w-3 h-3 mr-1" />
                        Confirmé
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 whitespace-nowrap" variant="secondary">
                        <MailWarning className="w-3 h-3 mr-1" />
                        En attente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <GuardianCell
                      birthdate={user.profile?.birthdate ?? null}
                      status={guardianByPlayer.get(user.id)}
                      isPlayer={user.team_memberships.some(
                        (m) => m.member_type === "player" && m.is_active,
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColors[user.status]} whitespace-nowrap`} variant="secondary">
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1 flex-nowrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setEditingUser(user)}
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4 text-blue-500" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-orange-600 hover:text-orange-700"
                        onClick={() => { setResetPasswordUser(user); setNewPassword(""); }}
                        disabled={actionLoading === user.id}
                        title="Réinitialiser le mot de passe"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      {user.status === "Invité" && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 text-blue-600 hover:text-blue-700"
                            onClick={() => handleResendInvitation(user)}
                            disabled={actionLoading === user.id}
                            title="Renvoyer l'invitation"
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 text-green-600 hover:text-green-700"
                            onClick={() => handleForceValidate(user)}
                            disabled={actionLoading === user.id}
                            title="Valider manuellement"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      {user.status === "Suspendu" ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-blue-600 hover:text-blue-700"
                          onClick={() => handleRestore(user)}
                          disabled={actionLoading === user.id}
                          title="Réactiver"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(user)}
                          disabled={actionLoading === user.id}
                          title="Suspendre"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <p className="text-muted-foreground">Aucun utilisateur trouvé</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdate={fetchUsers}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre cet utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utilisateur <strong>{deleteConfirm?.email}</strong> sera suspendu et
              ne pourra plus accéder à la plateforme. Cette action est réversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleSoftDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Suspendre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-orange-600" />
              Réinitialiser le mot de passe
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Définir un nouveau mot de passe pour <strong>{resetPasswordUser ? getUserDisplayName(resetPasswordUser) : ""}</strong> ({resetPasswordUser?.email})
                </p>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Nouveau mot de passe (min. {ADMIN_MIN_LENGTH} caractères)
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{ADMIN_PASSWORD_HELP_TEXT}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              onClick={() => resetPasswordUser && handleResetPassword(resetPasswordUser)}
              disabled={newPassword.length < ADMIN_MIN_LENGTH || actionLoading === resetPasswordUser?.id}
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Réinitialiser
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
