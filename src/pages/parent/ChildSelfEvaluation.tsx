/**
 * @page ChildSelfEvaluation
 * @route /parent/children/:id/self-evaluation
 *
 * Auto-débrief d'un enfant de moins de 15 ans, rempli AVEC son représentant
 * légal. Le débrief est enregistré au nom de l'enfant (type « self ») avec
 * evaluator_id = parent : l'historique l'indique « Rempli avec le représentant
 * légal », pour que personne ne le prenne pour la seule parole de l'enfant.
 *
 * Verrous en base (cet écran ne fait que les refléter) :
 *  - policies « Guardians create self evaluation for their child » : parent
 *    avec consentement actif, enfant de moins de 15 ans ;
 *  - trigger trg_enforce_self_eval_consent : auto-évaluation autorisée au
 *    consentement.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Star } from "lucide-react";
import type { ComponentProps } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelfEvaluationForm } from "@/components/evaluation/SelfEvaluationForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePlayerData, getPlayerName } from "@/hooks/usePlayerData";
import { requiresParentalConsent } from "@/lib/age-policy";

type FormThemes = ComponentProps<typeof SelfEvaluationForm>["themes"];

function Message({ title, children, onBack }: { title: string; children?: React.ReactNode; onBack: () => void }) {
  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>
      <div className="glass-card p-12 text-center">
        <ClipboardList className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">{title}</h3>
        {children && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{children}</p>}
      </div>
    </AppLayout>
  );
}

export default function ChildSelfEvaluation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { player, teamMembership, frameworkId, themes, loading } = usePlayerData(id);

  const { data: isGuardian, isLoading: guardianLoading } = useQuery({
    queryKey: ["is-legal-guardian", user?.id, id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "has_guardian_access" as never,
        { _guardian_id: user!.id, _minor_id: id! } as never,
      );
      if (error) {
        console.error("has_guardian_access failed", error);
        return false;
      }
      return data === true;
    },
    enabled: !!user && !!id,
  });

  const goBack = () => navigate(id ? `/players/${id}` : "/parent/my-children");

  if (loading || guardianLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const childFirstName = player?.first_name || "votre enfant";

  if (!player || !isGuardian || !requiresParentalConsent(player.birthdate)) {
    return (
      <Message title="Auto-débrief non disponible" onBack={() => navigate("/parent/my-children")}>
        Seul le représentant légal d'un enfant de moins de 15 ans peut remplir un
        auto-débrief avec lui. À partir de 15 ans, le jeune le remplit lui-même.
      </Message>
    );
  }

  const selfEvalConsentAt = (player as { self_eval_consent_at?: string | null }).self_eval_consent_at;
  if (!selfEvalConsentAt) {
    return (
      <Message title="Auto-évaluation non autorisée" onBack={goBack}>
        Vous n'avez pas autorisé l'auto-évaluation de {childFirstName}. Vous pouvez
        modifier ce choix depuis votre espace « Mes consentements ».
      </Message>
    );
  }

  if (!teamMembership || !frameworkId || themes.length === 0) {
    return (
      <Message title="Référentiel non disponible" onBack={goBack}>
        L'équipe de {childFirstName} doit d'abord configurer son référentiel de compétences.
      </Message>
    );
  }

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={goBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour à la fiche
      </Button>

      <div className="glass-card p-6 mb-8 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Star className="w-7 h-7 text-emerald-500" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Auto-débrief de {childFirstName}
              </h1>
              <Badge variant="outline" className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                Rempli avec le représentant légal
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Remplissez-le ensemble : ce sont les réponses de {childFirstName} qui comptent.
              Le coach verra qu'il a été rempli avec vous.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {teamMembership.team.name} - {teamMembership.team.club?.name}
            </p>
          </div>
        </div>
      </div>

      <SelfEvaluationForm
        playerId={player.id}
        playerName={getPlayerName(player)}
        teamId={teamMembership.team_id}
        frameworkId={frameworkId}
        themes={themes as unknown as FormThemes}
        onSaved={() => navigate(`/players/${player.id}`)}
      />
    </AppLayout>
  );
}
