/**
 * @page SupporterDebriefs
 * @route /supporter/debriefs
 *
 * Liste des débriefs créés par le Supporter courant.
 *
 * @description
 * Filtre les évaluations sur `evaluator_id = user.id` et `type = "supporter"`.
 * Permet au supporter de relire ses contributions.
 *
 * @access Supporter (auto-scopé)
 *
 * @maintenance
 * Les débriefs supporter sont consultatifs (mem://logic/assessment-data-isolation-rules)
 * et n'impactent pas la progression officielle du joueur.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClipboardList, Heart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PlayerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

interface EvalEntry {
  id: string;
  name: string;
  date: string;
  type: string;
  evaluator_name: string;
}

const SupporterDebriefs = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole } = useAuth();

  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // Fetch linked players
  const { data: linkedPlayers, isLoading: loadingPlayers } = useQuery({
    queryKey: ["supporter-debrief-players", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: links } = await supabase
        .from("supporters_link")
        .select("player_id")
        .eq("supporter_id", user.id);
      if (!links || links.length === 0) return [];

      const playerIds = links.map(l => l.player_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", playerIds);
      return (profiles || []) as PlayerProfile[];
    },
    enabled: !!user,
  });

  // Fetch evaluations for all linked players (supporter + coach, exclude self)
  const { data: evaluationsMap, isLoading: loadingEvals } = useQuery({
    queryKey: ["supporter-debrief-evals", user?.id, linkedPlayers?.map(p => p.id)],
    queryFn: async () => {
      if (!user || !linkedPlayers || linkedPlayers.length === 0) return {};
      const playerIds = linkedPlayers.map(p => p.id);

      const { data: evals } = await supabase
        .from("evaluations")
        .select("id, name, date, type, player_id, evaluator_id")
        .in("player_id", playerIds)
        .in("type", ["coach", "supporter"] as any)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!evals || evals.length === 0) return {};

      // Fetch evaluator names
      const evaluatorIds = [...new Set(evals.map(e => e.evaluator_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", evaluatorIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const getName = (p: any) => {
        if (!p) return "Inconnu";
        if (p.nickname) return p.nickname;
        if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
        return p.first_name || "Inconnu";
      };

      const result: Record<string, { supporter: EvalEntry[]; coach: EvalEntry[] }> = {};
      for (const e of evals) {
        if (!result[e.player_id]) {
          result[e.player_id] = { supporter: [], coach: [] };
        }
        const entry: EvalEntry = {
          id: e.id,
          name: e.name,
          date: e.date,
          type: e.type,
          evaluator_name: getName(profileMap.get(e.evaluator_id)),
        };
        if (e.type === "supporter") {
          result[e.player_id].supporter.push(entry);
        } else {
          result[e.player_id].coach.push(entry);
        }
      }
      return result;
    },
    enabled: !!user && !!linkedPlayers && linkedPlayers.length > 0,
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const getPlayerName = (p: PlayerProfile) => {
    if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
    return p.nickname || p.first_name || "Joueur";
  };

  const isLoading = loadingPlayers || loadingEvals;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-pink-500" />
            Débriefs joueurs
          </h1>
          <p className="text-muted-foreground mt-1">Historique des débriefs par joueur</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : linkedPlayers && linkedPlayers.length > 0 ? (
          <Accordion type="multiple" className="space-y-2">
            {linkedPlayers.map((player) => {
              const playerEvals = evaluationsMap?.[player.id];
              const supporterEvals = playerEvals?.supporter || [];
              const coachEvals = playerEvals?.coach || [];
              const totalEvals = supporterEvals.length + coachEvals.length;

              return (
                <AccordionItem
                  key={player.id}
                  value={player.id}
                  className="border border-border rounded-xl overflow-hidden bg-card"
                >
                  <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-500 font-bold text-sm">
                        {getPlayerName(player).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-foreground">{getPlayerName(player)}</span>
                      <Badge variant="secondary" className="text-xs">
                        {totalEvals} débrief{totalEvals > 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-5">
                    {totalEvals === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Aucun débrief enregistré
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {/* Supporter debriefs */}
                        {supporterEvals.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-pink-500 mb-2 flex items-center gap-2">
                              <Heart className="w-4 h-4" />
                              Mes débriefs
                            </h4>
                            <div className="space-y-2">
                              {supporterEvals.map((ev) => (
                                <EvalRow key={ev.id} eval={ev} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Coach debriefs */}
                        {coachEvals.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-orange-500 mb-2 flex items-center gap-2">
                              <ClipboardList className="w-4 h-4" />
                              Débriefs du coach
                            </h4>
                            <div className="space-y-2">
                              {coachEvals.map((ev) => (
                                <EvalRow key={ev.id} eval={ev} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 glass-card">
            <Heart className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Aucun joueur lié à votre compte</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

function EvalRow({ eval: ev }: { eval: EvalEntry }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
      <div>
        <p className="text-sm font-medium text-foreground">{ev.name}</p>
        <p className="text-xs text-muted-foreground">
          Par {ev.evaluator_name} • {format(new Date(ev.date), "d MMM yyyy", { locale: fr })}
        </p>
      </div>
    </div>
  );
}

export default SupporterDebriefs;
