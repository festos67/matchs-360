/**
 * @page FrameworksList
 * @route /frameworks
 *
 * Vue admin globale de tous les référentiels (templates + club + équipe).
 * Cible : admin (tous référentiels), club_admin (référentiels de son club + équipes
 * de son club uniquement, scoping appliqué côté RLS).
 *
 * @access admin, club_admin
 * @features
 *  - Tableau filtrable : Nom / Type / Club / Équipe / # thèmes / # compétences / MAJ
 *  - Filtres : Type (template/club/équipe) + Club (admin uniquement)
 *  - Recherche texte sur le nom (case-insensitive)
 *  - Bouton "Éditer" → route vers ClubFrameworkEditor ou FrameworkEditor existants
 *  - Pas de duplication de logique d'édition (CRUD reste dans les éditeurs dédiés)
 *  - Templates en lecture seule (pas de bouton Éditer)
 */
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, BookOpen, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type FrameworkRow = {
  id: string;
  name: string;
  is_template: boolean;
  team_id: string | null;
  club_id: string | null;
  created_at: string;
  updated_at: string;
  club: { id: string; name: string } | null;
  team: { id: string; name: string; club_id: string } | null;
  themes_count: number;
  skills_count: number;
};

export default function FrameworksList() {
  const { user, currentRole, isAdmin, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "template" | "club" | "team">("all");
  const [clubFilter, setClubFilter] = useState<"all" | string>("all");

  const isClubAdmin = currentRole?.role === "club_admin";

  // Liste des clubs (pour le filtre admin uniquement)
  const { data: clubs } = useQuery({
    queryKey: ["frameworks-clubs-filter"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Liste des frameworks avec joins (RLS scope automatique côté DB)
  const { data: frameworks, isLoading } = useQuery({
    queryKey: ["frameworks-list", isAdmin, currentRole?.club_id],
    enabled: !!user && (isAdmin || isClubAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competence_frameworks")
        .select(
          `
          id, name, is_template, team_id, club_id, created_at, updated_at,
          club:clubs(id, name),
          team:teams(id, name, club_id),
          themes(id, skills(id))
        `,
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((f: any) => ({
        ...f,
        themes_count: f.themes?.length ?? 0,
        skills_count:
          f.themes?.reduce(
            (acc: number, t: any) => acc + (t.skills?.length ?? 0),
            0,
          ) ?? 0,
      })) as FrameworkRow[];
    },
  });

  // Filtrage côté client
  const filtered = useMemo(() => {
    if (!frameworks) return [];
    return frameworks.filter((f) => {
      if (typeFilter === "template" && !f.is_template) return false;
      if (typeFilter === "club" && (f.is_template || !f.club_id || f.team_id))
        return false;
      if (typeFilter === "team" && !f.team_id) return false;
      if (clubFilter !== "all") {
        const fwClubId = f.club?.id ?? f.team?.club_id ?? null;
        if (fwClubId !== clubFilter) return false;
      }
      if (
        search.trim() &&
        !f.name.toLowerCase().includes(search.toLowerCase().trim())
      )
        return false;
      return true;
    });
  }, [frameworks, typeFilter, clubFilter, search]);

  // Garde d'accès (defense in depth en plus de ProtectedRoute)
  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Cette page est réservée à l'admin global. Les club_admin sont redirigés
  // vers leur référentiel club dédié (sidebar « Référentiel club »).
  if (!isAdmin && isClubAdmin && currentRole?.club_id) {
    return <Navigate to={`/clubs/${currentRole.club_id}/framework`} replace />;
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // Tout référentiel doit être ouvrable. Les templates club et les référentiels
  // club ouvrent la vue club (lecture seule par défaut). Les référentiels
  // équipe ouvrent l'éditeur équipe.
  const getOpenPath = (f: FrameworkRow): string | null => {
    if (f.team_id) return `/teams/${f.team_id}/framework`;
    if (f.club_id) return `/clubs/${f.club_id}/framework`;
    return null;
  };

  const getTypeBadge = (f: FrameworkRow) => {
    if (f.is_template)
      return <Badge variant="secondary">Modèle</Badge>;
    if (f.team_id) return <Badge variant="default">Équipe</Badge>;
    if (f.club_id) return <Badge variant="outline">Club</Badge>;
    return <span className="text-muted-foreground">—</span>;
  };

  const getClubName = (f: FrameworkRow): string => {
    if (f.club?.name) return f.club.name;
    if (f.team?.club_id) {
      const found = clubs?.find((c) => c.id === f.team!.club_id);
      if (found) return found.name;
    }
    return "—";
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-accent" />
              Référentiels de compétences
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Vue d'ensemble des référentiels
              {isAdmin ? " (tous clubs)" : " de votre club"}
            </p>
          </div>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtres</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Rechercher par nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="template">Modèles</SelectItem>
                <SelectItem value="club">Référentiels club</SelectItem>
                <SelectItem value="team">Référentiels équipe</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={clubFilter} onValueChange={setClubFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clubs</SelectItem>
                  {clubs?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Tableau */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                Aucun référentiel ne correspond aux filtres.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Équipe</TableHead>
                    <TableHead className="text-center">Thèmes</TableHead>
                    <TableHead className="text-center">Compétences</TableHead>
                    <TableHead>MAJ</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filtered.map((f) => {
                    const openPath = getOpenPath(f);
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.name}</TableCell>
                        <TableCell>{getTypeBadge(f)}</TableCell>
                        <TableCell>{getClubName(f)}</TableCell>
                        <TableCell>{f.team?.name ?? "—"}</TableCell>
                        <TableCell className="text-center">
                          {f.themes_count}
                        </TableCell>
                        <TableCell className="text-center">
                          {f.skills_count}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(f.updated_at), "dd MMM yyyy", {
                            locale: fr,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          {openPath ? (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <Link to={openPath}>
                                <Eye className="w-3.5 h-3.5 mr-1.5" />
                                Ouvrir
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              Indisponible
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
