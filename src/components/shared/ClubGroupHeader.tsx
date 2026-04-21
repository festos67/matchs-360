/**
 * @component ClubGroupHeader
 * @description Bandeau séparateur affichant un club (logo, nom, initiales) au-dessus
 *              d'un groupe d'éléments (équipes, joueurs, coachs). Utilisé pour
 *              structurer les listes hiérarchiques par club.
 * @props
 *  - name: string — nom du club
 *  - shortName?: string — initiales du club
 *  - logoUrl?: string — URL du logo
 *  - primaryColor?: string — couleur identitaire
 *  - count?: number — nombre d'éléments dans le groupe
 * @features
 *  - Bandeau coloré avec couleur primaire du club
 *  - Badge optionnel pour le compte d'éléments
 *  - Logo + initiales fallback
 * @maintenance
 *  - Listings groupés : mem://features/grouped-listings-logic
 *  - Vues de gestion : mem://navigation/management-views
 */
interface ClubGroupHeaderProps {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  count?: number;
}

export const ClubGroupHeader = ({
  name,
  shortName,
  logoUrl,
  primaryColor,
  count,
}: ClubGroupHeaderProps) => {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="w-5 h-5 rounded flex items-center justify-center overflow-hidden shrink-0"
        style={{
          backgroundColor: logoUrl ? "transparent" : primaryColor || "#3B82F6",
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[9px] font-bold text-white leading-none">
            {(shortName || name.slice(0, 2)).toUpperCase()}
          </span>
        )}
      </div>
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
        {name}
      </h2>
      {typeof count === "number" && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </div>
  );
};