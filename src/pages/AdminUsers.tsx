/**
 * @page AdminUsers
 * @route /admin/users
 *
 * Console de gestion utilisateurs réservée au Super Admin.
 * (mem://features/admin/user-management)
 *
 * @description
 * Permet de visualiser, filtrer, éditer et restaurer tous les comptes de la
 * plateforme. Inclut les actions sensibles (promotion Super Admin, reset password
 * en mode test).
 *
 * @features
 * - Filtres : rôle, statut (actif/archivé/en attente), recherche full-text
 * - Refresh manuel pour synchroniser avec auth.users
 * - Promotion Super Admin (mem://auth/super-admin) — strictement réservée
 *   à `asahand@protonmail.com`
 * - Restauration de comptes soft-deleted
 * - Reset password en mode test (mem://security/admin-actions-guard)
 *
 * @access
 * Super Admin uniquement (route protégée par ProtectedRoute + RBAC)
 *
 * @maintenance
 * Toute action sensible passe par l'edge function `admin-users` qui vérifie
 * côté serveur l'identité du Super Admin (jamais côté client uniquement).
 */
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
  ShieldPlus,
  Search,
  CheckCircle,
  Trash2,
  Edit,
  RefreshCw,
  RotateCcw,
  Mail,
  MailWarning,
  KeyRound,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
}

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

const SUPER_ADMIN_EMAIL = "asahand@protonmail.com";

export default function AdminUsers() {
  const { hasAdminRole: isAdmin, loading: authLoading, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [promoteConfirm, setPromoteConfirm] = useState<AdminUser | null>(null);
  const [promoteInput, setPromoteInput] = useState("");
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [clubFilter, setClubFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const isSuperAdmin = currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error("Accès non autorisé");
      navigate("/dashboard");
    }
  }, [isAdmin, authLoading, navigate]);

  const { data: users = [], isLoading: loading, isFetching, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
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
      return data.users as AdminUser[];
    },
    enabled: !!isAdmin,
  });

  const fetchUsers = () => {
    refetch();
  };

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
    if (!newPassword || newPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
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

  const handlePromoteAdmin = async (targetUser: AdminUser) => {
    try {
      setActionLoading(targetUser.id);
      await callAdminAction("promote-admin", { userId: targetUser.id });
      toast.success(`${getUserDisplayName(targetUser)} a été promu Super Admin`);
      setPromoteConfirm(null);
      setPromoteInput("");
      fetchUsers();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la promotion");
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

  // Extract unique clubs, coaches, players for filters
  const uniqueClubs = Array.from(new Map(
    users.flatMap(u => u.roles.filter(r => r.club_name).map(r => [r.club_id!, r.club_name!]))
  ).entries()).map(([id, name]) => ({ id, name }));

  const uniqueCoaches = users
    .filter(u => u.team_memberships.some(m => m.member_type === "coach" && m.is_active))
    .map(u => ({ id: u.id, name: getUserDisplayName(u) }));

  const uniquePlayers = users
    .filter(u => u.team_memberships.some(m => m.member_type === "player" && m.is_active))
    .map(u => ({ id: u.id, name: getUserDisplayName(u) }));

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = !searchLower || 
      user.email.toLowerCase().includes(searchLower) ||
      user.first_name?.toLowerCase().includes(searchLower) ||
      user.last_name?.toLowerCase().includes(searchLower) ||
      user.nickname?.toLowerCase().includes(searchLower);

    const matchesClub = clubFilter === "all" || 
      user.roles.some(r => r.club_id === clubFilter) ||
      user.team_memberships.some(m => m.is_active && users.find(u => 
        u.roles.some(r => r.club_id === clubFilter) && 
        u.team_memberships.some(tm => tm.team_id === m.team_id && tm.is_active)
      ));

    const matchesCoach = coachFilter === "all" || user.id === coachFilter;
    const matchesPlayer = playerFilter === "all" || user.id === playerFilter;

    const matchesRole = roleFilter === "all" || 
      user.roles.some(r => r.role === roleFilter) ||
      (roleFilter === "coach" && user.team_memberships.some(m => m.member_type === "coach" && m.is_active)) ||
      (roleFilter === "player" && user.team_memberships.some(m => m.member_type === "player" && m.is_active)) ||
      (roleFilter === "supporter" && user.supporter_links.length > 0);

    return matchesSearch && matchesClub && matchesCoach && matchesPlayer && matchesRole;
  });

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
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

  if (!isAdmin) {
    return null;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Gestion des Utilisateurs
              </h1>
              <p className="text-muted-foreground">
                Administration complète de la plateforme
              </p>
            </div>
          </div>
          <Button onClick={fetchUsers} variant="outline" size="sm" disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Chargement..." : "Actualiser"}
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
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les clubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les clubs</SelectItem>
              {uniqueClubs.map(club => (
                <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachFilter} onValueChange={setCoachFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les coachs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les coachs</SelectItem>
              {uniqueCoaches.map(coach => (
                <SelectItem key={coach.id} value={coach.id}>{coach.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={playerFilter} onValueChange={setPlayerFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les joueurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les joueurs</SelectItem>
              {uniquePlayers.map(player => (
                <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tous les rôles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="club_admin">Responsable club</SelectItem>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="player">Joueur</SelectItem>
              <SelectItem value="supporter">Supporter</SelectItem>
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
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Identité</TableHead>
                <TableHead className="w-[30%]">Rôles</TableHead>
                <TableHead className="w-[10%]">Email</TableHead>
                <TableHead className="w-[10%]">Statut</TableHead>
                <TableHead className="text-right w-[20%]">Actions</TableHead>
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
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" variant="secondary">
                        <Mail className="w-3 h-3 mr-1" />
                        Confirmé
                      </Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" variant="secondary">
                        <MailWarning className="w-3 h-3 mr-1" />
                        En attente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[user.status]} variant="secondary">
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingUser(user)}
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4 text-blue-500" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-700"
                        onClick={() => { setResetPasswordUser(user); setNewPassword(""); }}
                        disabled={actionLoading === user.id}
                        title="Réinitialiser le mot de passe"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      {/* Promote to Super Admin - only visible to super admin, hidden if user already admin */}
                      {isSuperAdmin && !user.roles.some(r => r.role === "admin") && user.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-amber-600 hover:text-amber-700"
                          onClick={() => { setPromoteConfirm(user); setPromoteInput(""); }}
                          disabled={actionLoading === user.id}
                          title="Promouvoir Super Admin"
                        >
                          <ShieldPlus className="w-4 h-4" />
                        </Button>
                      )}
                      {user.status === "Invité" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-600 hover:text-blue-700"
                            onClick={() => handleResendInvitation(user)}
                            disabled={actionLoading === user.id}
                            title="Renvoyer l'invitation"
                          >
                            <Mail className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600 hover:text-green-700"
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
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => handleRestore(user)}
                          disabled={actionLoading === user.id}
                          title="Réactiver"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
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
                  <TableCell colSpan={5} className="text-center py-8">
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

      {/* Promote Super Admin Confirmation */}
      <AlertDialog open={!!promoteConfirm} onOpenChange={(open) => { if (!open) { setPromoteConfirm(null); setPromoteInput(""); } }}>
        <AlertDialogContent className="border-amber-500/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldPlus className="w-5 h-5" />
              Promouvoir Super Admin
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Êtes-vous sûr de vouloir accorder les droits de <strong>Super Administrateur</strong> à{" "}
                  <strong>{promoteConfirm ? getUserDisplayName(promoteConfirm) : ""}</strong> ({promoteConfirm?.email}) ?
                </p>
                <p className="text-destructive font-medium">
                  Cette personne aura un accès total à l'application et pourra modifier ou supprimer toutes les données.
                </p>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-2">
                    Tapez <strong>CONFIRMER</strong> pour valider cette action :
                  </label>
                  <Input
                    value={promoteInput}
                    onChange={(e) => setPromoteInput(e.target.value)}
                    placeholder="CONFIRMER"
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              onClick={() => promoteConfirm && handlePromoteAdmin(promoteConfirm)}
              disabled={promoteInput !== "CONFIRMER" || actionLoading === promoteConfirm?.id}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <ShieldPlus className="w-4 h-4 mr-2" />
              Promouvoir Super Admin
            </Button>
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
                    Nouveau mot de passe (min. 6 caractères)
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              onClick={() => resetPasswordUser && handleResetPassword(resetPasswordUser)}
              disabled={newPassword.length < 6 || actionLoading === resetPasswordUser?.id}
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

