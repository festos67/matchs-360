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
}: TeamCardProps) => {
  const content = (
    <div className="flex flex-col items-center text-center">
      <CircleAvatar
        shape="square"
        name={name}
        shortName={shortName}
        color={color || "#3B82F6"}
        size="md"
        showName={false}
      />
      <p className="font-semibold text-foreground mt-2 group-hover:text-primary transition-colors text-sm">
        {name}
      </p>
      {season && (
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