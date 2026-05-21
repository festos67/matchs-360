/**
 * BUG-PHOTO-002/003 — Composant unique d'affichage de photo de profil.
 *
 * RÈGLE D'OR : aucun composant ne doit rendre `photo_url` directement.
 * Tout passage par <ProfilePhoto> (ou <CircleAvatar profile={...} />)
 * garantit signed URL pour les mineurs + gate consentement (mineur ET adulte).
 *
 * Si pas de photo affichable (pas de consentement, mineur sans URL signée,
 * erreur) → fallback initiales sur fond dégradé teamColor.
 */
import { cn } from "@/lib/utils";
import { usePhotoUrl, type DisplayablePhoto } from "@/hooks/usePhotoUrl";

export interface ProfilePhotoProfile extends DisplayablePhoto {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}

interface ProfilePhotoProps {
  profile: ProfilePhotoProfile | null | undefined;
  /** Couleur de fond du fallback (initiales) */
  color?: string;
  /** Tailwind size classes (w-X h-X) — passe par className pour plus de flexibilité */
  className?: string;
  /** Taille de la police des initiales */
  textClassName?: string;
  shape?: "circle" | "square";
  alt?: string;
}

function getInitials(p: ProfilePhotoProfile | null | undefined): string {
  if (!p) return "?";
  const full = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.nickname || "";
  const initials = full
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

export function ProfilePhoto({
  profile,
  color = "#3B82F6",
  className,
  textClassName,
  shape = "circle",
  alt,
}: ProfilePhotoProps) {
  const resolvedUrl = usePhotoUrl(profile);
  const initials = getInitials(profile);
  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        radius,
        className,
      )}
      style={{
        background: resolvedUrl
          ? `url(${resolvedUrl}) center/cover`
          : `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
      }}
      role={resolvedUrl ? "img" : undefined}
      aria-label={alt}
    >
      {!resolvedUrl && (
        <span className={cn("font-display font-bold text-white", textClassName)}>
          {initials}
        </span>
      )}
    </div>
  );
}