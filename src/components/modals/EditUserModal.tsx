/**
 * @modal EditUserModal
 * @description Modale d'édition complète d'un utilisateur (vue Super Admin).
 *              Permet d'éditer profil, gérer rôles cumulés, affecter équipes,
 *              réinitialiser le mot de passe et soft-delete le compte.
 * @access Super Admin uniquement (god view)
 * @features
 *  - Édition profil complet (prénom, nom, surnom, email, photo)
 *  - Gestion multi-rôles via Badges (admin / club_admin / coach / player / supporter)
 *  - Action "Promouvoir Super Admin" restreinte à asahand@protonmail.com
 *  - Reset password en mode test (Edge Function admin-users)
 *  - Soft delete via deleted_at avec confirmation
 * @maintenance
 *  - Sécurité Super Admin : mem://auth/super-admin
 *  - Action admin guard : mem://security/admin-actions-guard
 *  - Gestion users admin : mem://features/admin/user-management
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { X, Plus, CheckCircle, RotateCcw, Mail } from "lucide-react";

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
  status: "Actif" | "Invité" | "Suspendu";
  roles: UserRole[];
  team_memberships: TeamMembership[];
  supporter_links: SupporterLink[];
}

interface Club {
  id: string;
  name: string;
}

interface Team {
  id: string;
  name: string;
  club_id: string;
}

interface Player {
  id: string;
  name: string;
}

interface EditUserModalProps {
  user: AdminUser;
  onClose: () => void;
  onUpdate: () => void;
}

const roleLabels: Record<string, string> = {
  admin: "Administrateur",
  club_admin: "Admin Club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

const roleColors: Record<string, string> = {
  admin: "bg-destructive text-destructive-foreground",
  club_admin: "bg-blue-500 text-white",
  coach: "bg-green-500 text-white",
  player: "bg-orange-500 text-white",
  supporter: "bg-purple-500 text-white",
};

export function EditUserModal({ user, onClose, onUpdate }: EditUserModalProps) {
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user.photo_url || null);
  const [removePhoto, setRemovePhoto] = useState(false);

  // For adding new roles
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [selectedClub, setSelectedClub] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [coachRole, setCoachRole] = useState<"referent" | "assistant">("assistant");

  // Data for selects
  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    fetchClubs();
  }, []);

  useEffect(() => {
    if (selectedClub) {
      fetchTeams(selectedClub);
    } else {
      setTeams([]);
    }
  }, [selectedClub]);

  useEffect(() => {
    if (newRole === "supporter") {
      fetchPlayers();
    }
  }, [newRole]);

  const fetchClubs = async () => {
    const { data } = await supabase
      .from("clubs")
      .select("id, name")
      .is("deleted_at", null)
      .order("name");
    setClubs(data || []);
  };

  const fetchTeams = async (clubId: string) => {
    const { data } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .eq("club_id", clubId)
      .is("deleted_at", null)
      .order("name");
    setTeams(data || []);
  };

  const fetchPlayers = async () => {
    // Get all players from team_members
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("user_id, profiles!team_members_user_id_fkey(id, first_name, last_name, nickname)")
      .eq("member_type", "player")
      .eq("is_active", true);

    const playerList: Player[] = (teamMembers || []).map((tm) => {
      const profile = tm.profiles as { id: string; first_name: string | null; last_name: string | null; nickname: string | null } | null;
      return {
        id: profile?.id || tm.user_id,
        name: profile?.nickname || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Joueur inconnu",
      };
    });

    // Remove duplicates
    const uniquePlayers = playerList.filter(
      (player, index, self) => self.findIndex((p) => p.id === player.id) === index
    );

    setPlayers(uniquePlayers);
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

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${user.id}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);

      // Upload photo if needed
      let photoUrl: string | null | undefined = undefined;
      if (photoFile) {
        photoUrl = await uploadPhoto();
      } else if (removePhoto) {
        photoUrl = null;
      }

      const payload: Record<string, unknown> = {
        userId: user.id,
        firstName,
        lastName,
        nickname,
      };
      if (photoUrl !== undefined) {
        payload.photoUrl = photoUrl;
      }

      await callAdminAction("update-profile", payload);
      toast.success("Profil mis à jour");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = async () => {
    try {
      setSaving(true);

      const payload: Record<string, unknown> = {
        userId: user.id,
        role: newRole,
      };

      if (newRole === "club_admin" || newRole === "coach" || newRole === "player") {
        payload.clubId = selectedClub;
      }

      if (newRole === "coach" || newRole === "player") {
        payload.teamId = selectedTeam;
        if (newRole === "coach") {
          payload.coachRole = coachRole;
        }
      }

      if (newRole === "supporter") {
        payload.playerId = selectedPlayer;
      }

      await callAdminAction("add-role", payload);
      toast.success("Rôle ajouté");
      setShowAddRole(false);
      setNewRole("");
      setSelectedClub("");
      setSelectedTeam("");
      setSelectedPlayer("");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'ajout du rôle");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    try {
      await callAdminAction("remove-role", { roleId });
      toast.success("Rôle supprimé");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    }
  };

  const handleRemoveTeamMembership = async (membershipId: string) => {
    try {
      await callAdminAction("remove-role", { teamMembershipId: membershipId });
      toast.success("Appartenance équipe supprimée");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    }
  };

  const handleRemoveSupporterLink = async (linkId: string) => {
    try {
      await callAdminAction("remove-role", { supporterLinkId: linkId });
      toast.success("Lien supporter supprimé");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression");
    }
  };

  const handleForceValidate = async () => {
    try {
      await callAdminAction("force-validate", { userId: user.id });
      toast.success("Email validé");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la validation");
    }
  };

  const handleRestore = async () => {
    try {
      await callAdminAction("restore", { userId: user.id });
      toast.success("Utilisateur réactivé");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la réactivation");
    }
  };

  const handleResendInvitation = async () => {
    try {
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
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors du renvoi de l'invitation");
    }
  };

  const needsClubSelection = newRole === "club_admin" || newRole === "coach" || newRole === "player";
  const needsTeamSelection = newRole === "coach" || newRole === "player";
  const needsPlayerSelection = newRole === "supporter";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <CircleAvatar
              shape="circle"
              imageUrl={user.photo_url}
              name={user.email}
              size="sm"
            />
            <div>
              <div>Modifier l'utilisateur</div>
              <div className="text-sm font-normal text-muted-foreground">
                {user.email}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quick Actions */}
          {(user.status === "Invité" || user.status === "Suspendu") && (
            <div className="flex flex-wrap gap-2">
              {user.status === "Invité" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResendInvitation}
                    className="text-blue-600"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Renvoyer l'invitation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleForceValidate}
                    className="text-green-600"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Valider manuellement
                  </Button>
                </>
              )}
              {user.status === "Suspendu" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestore}
                  className="text-blue-600"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Réactiver
                </Button>
              )}
            </div>
          )}

          {/* Profile Info */}
          <div className="space-y-4">
            <h3 className="font-semibold">Informations du profil</h3>

            <UserPhotoUpload
              photoPreview={photoPreview}
              initials={getInitials()}
              onFileSelected={(file, preview) => {
                setPhotoFile(file);
                setPhotoPreview(preview);
                setRemovePhoto(false);
              }}
              onRemovePhoto={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
                setRemovePhoto(true);
              }}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Surnom</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={saving}>
              Enregistrer le profil
            </Button>
          </div>

          <Separator />

          {/* Roles */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Rôles et appartenances</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddRole(!showAddRole)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un rôle
              </Button>
            </div>

            {/* Existing Roles */}
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Badge
                  key={role.id}
                  className={`${roleColors[role.role] || ""} pr-1`}
                >
                  {roleLabels[role.role] || role.role}
                  {role.club_name && ` (${role.club_name})`}
                  <button
                    onClick={() => handleRemoveRole(role.id)}
                    className="ml-2 hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Team Memberships */}
            {user.team_memberships.filter((m) => m.is_active).length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Équipes actives
                </h4>
                <div className="flex flex-wrap gap-2">
                  {user.team_memberships
                    .filter((m) => m.is_active)
                    .map((membership) => (
                      <Badge
                        key={membership.id}
                        variant="outline"
                        className="pr-1"
                      >
                        {membership.member_type === "coach" ? "🏋️" : "⚽"}{" "}
                        {membership.team_name}
                        {membership.coach_role && ` (${membership.coach_role})`}
                        <button
                          onClick={() => handleRemoveTeamMembership(membership.id)}
                          className="ml-2 hover:bg-muted rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Supporter Links */}
            {user.supporter_links.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Joueurs suivis (Supporter)
                </h4>
                <div className="flex flex-wrap gap-2">
                  {user.supporter_links.map((link) => (
                    <Badge key={link.id} variant="outline" className="pr-1">
                      👨‍👩‍👧 {link.player_name}
                      <button
                        onClick={() => handleRemoveSupporterLink(link.id)}
                        className="ml-2 hover:bg-muted rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Add Role Form */}
            {showAddRole && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <h4 className="font-medium">Ajouter un nouveau rôle</h4>

                <div className="space-y-2">
                  <Label>Type de rôle</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un rôle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrateur</SelectItem>
                      <SelectItem value="club_admin">Admin Club</SelectItem>
                      <SelectItem value="coach">Coach</SelectItem>
                      <SelectItem value="player">Joueur</SelectItem>
                      <SelectItem value="supporter">Supporter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {needsClubSelection && (
                  <div className="space-y-2">
                    <Label>Club</Label>
                    <Select value={selectedClub} onValueChange={setSelectedClub}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner un club" />
                      </SelectTrigger>
                      <SelectContent>
                        {clubs.map((club) => (
                          <SelectItem key={club.id} value={club.id}>
                            {club.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {needsTeamSelection && selectedClub && (
                  <div className="space-y-2">
                    <Label>Équipe</Label>
                    <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une équipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {newRole === "coach" && selectedTeam && (
                  <div className="space-y-2">
                    <Label>Type de coach</Label>
                    <Select
                      value={coachRole}
                      onValueChange={(v) => setCoachRole(v as "referent" | "assistant")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="referent">Référent</SelectItem>
                        <SelectItem value="assistant">Assistant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {needsPlayerSelection && (
                  <PlayerSearchField
                    players={players}
                    value={selectedPlayer}
                    onChange={setSelectedPlayer}
                  />
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={handleAddRole}
                    disabled={
                      saving ||
                      !newRole ||
                      (needsClubSelection && !selectedClub) ||
                      (needsTeamSelection && !selectedTeam) ||
                      (needsPlayerSelection && !selectedPlayer)
                    }
                  >
                    Ajouter
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowAddRole(false);
                      setNewRole("");
                      setSelectedClub("");
                      setSelectedTeam("");
                      setSelectedPlayer("");
                    }}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlayerSearchField({ players, value, onChange }: { players: { id: string; name: string }[]; value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const selectedName = players.find((p) => p.id === value)?.name || "";

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  return (
    <div className="space-y-2">
      <Label>Joueur à suivre</Label>
      <Input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (value && e.target.value.toLowerCase() !== selectedName.toLowerCase()) {
            onChange("");
          }
        }}
        placeholder="Rechercher un joueur…"
        className="h-9"
      />
      <Select
        value={value}
        onValueChange={(v) => {
          onChange(v);
          const name = players.find((p) => p.id === v)?.name || "";
          setSearch(name);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={filtered.length === 0 ? "Aucun joueur trouvé" : "Sélectionner un joueur"} />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((player) => (
            <SelectItem key={player.id} value={player.id}>
              {player.name}
            </SelectItem>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucun joueur trouvé</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
