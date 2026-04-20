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