/**
 * @component TeamCard
 * @description Carte de présentation d'une équipe (avatar circulaire couleur,
 *              nom, statistiques) cliquable redirigeant vers la fiche équipe.
 * @props
 *  - id / name / shortName / color / playersCount / coachName
 * @features
 *  - Wrapper Link vers /teams/:id
 *  - CircleAvatar avec couleur identitaire de l'équipe
 *  - Affichage compteur joueurs + nom du Coach Référent
 *  - Hover state pour indication d'interactivité
 * @maintenance
 *  - Utilisé dans listings équipes et galerie dashboard club
 *  - Layout cohérent avec mem://navigation/management-views
 */
import { Link } from "react-router-dom";
import { CircleAvatar } from "@/components/shared/CircleAvatar";

interface TeamCardProps {
  id: string;
  name: string;
  shortName?: string | null;
  color?: string | null;
  season?: string | null;
  referentCoachName?: string | null;
  playerCount?: number;
  to?: string;
  /**
   * Si la saison passée correspond à la saison courante, on la masque
   * (l'utilisateur n'a pas besoin de la voir affichée par défaut).
   */
  hideSeason?: boolean;
}

export const TeamCard = ({
  id,
  name,
  shortName,
  color,
  season,
  referentCoachName,
  playerCount,
  to,
  hideSeason = false,
}: TeamCardProps) => {
  const content = (
    <div className="flex flex-col items-center text-center w-full">
      <div className="w-full aspect-square max-w-[7rem]">
        <CircleAvatar
          shape="square"
          name={name}
          shortName={shortName}
          color={color || "#3B82F6"}
          size="responsive"
          showName={false}
        />
      </div>
      <p className="font-semibold text-foreground mt-2 group-hover:text-primary transition-colors text-sm">
        {name}
      </p>
      {season && !hideSeason && (
        <p className="text-xs text-muted-foreground mt-0.5">{season}</p>
      )}
      {referentCoachName && (
        <p className="text-xs text-muted-foreground">
          Coach : {referentCoachName}
        </p>
      )}
      {typeof playerCount === "number" && (
        <p className="text-xs text-muted-foreground">
          {playerCount} joueur{playerCount > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );

  return (
    <Link key={id} to={to || `/teams/${id}`} className="group">
      {content}
    </Link>
  );
};