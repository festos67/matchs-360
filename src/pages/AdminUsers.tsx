import { useState, useEffect } from "react";
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

export default function AdminUsers() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error("Accès non autorisé");
      navigate("/dashboard");
    }
  }, [isAdmin, authLoading, navigate]);

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
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

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

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchLower) ||
      user.first_name?.toLowerCase().includes(searchLower) ||
      user.last_name?.toLowerCase().includes(searchLower) ||
      user.nickname?.toLowerCase().includes(searchLower)
    );
  });

  const getUserDisplayName = (user: AdminUser) => {
    if (user.nickname) return user.nickname;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim();
    }
    return user.email.split("@")[0];
  };

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
          <Button onClick={fetchUsers} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un utilisateur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identité</TableHead>
                <TableHead>Rôles</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CircleAvatar
                        imageUrl={user.photo_url}
                        name={getUserDisplayName(user)}
                        size="sm"
                      />
                      <div>
                        <div className="font-medium">{getUserDisplayName(user)}</div>
                        <div className="text-sm text-muted-foreground">
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
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {user.status === "Invité" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:text-green-700"
                          onClick={() => handleForceValidate(user)}
                          disabled={actionLoading === user.id}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      {user.status === "Suspendu" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => handleRestore(user)}
                          disabled={actionLoading === user.id}
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
                  <TableCell colSpan={4} className="text-center py-8">
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
    </AppLayout>
  );
}
