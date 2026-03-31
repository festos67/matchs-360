import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface CircleAvatarProps {
  name: string;
  shortName?: string | null;
  subtitle?: string;
  imageUrl?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
  icon?: ReactNode;
  badge?: ReactNode;
  className?: string;
  showName?: boolean;
}

const sizeClasses = {
  sm: "w-16 h-16",
  md: "w-24 h-24",
  lg: "w-32 h-32",
  xl: "w-40 h-40",
};

const textSizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
};

const subtitleSizeClasses = {
  sm: "text-xs mt-1",
  md: "text-sm mt-2",
  lg: "text-base mt-2",
  xl: "text-lg mt-3",
};

export const CircleAvatar = ({
  name,
  shortName,
  subtitle,
  imageUrl,
  color = "#3B82F6",
  size = "md",
  onClick,
  icon,
  badge,
  className,
  showName = true,
}: CircleAvatarProps) => {
  const displayText = shortName || name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex flex-col items-center cursor-pointer group",
        className
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "circle-avatar relative",
          sizeClasses[size]
        )}
        style={{
          background: imageUrl
            ? `url(${imageUrl}) center/cover`
            : `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
          boxShadow: `0 4px 24px -4px ${color}40`,
        }}
      >
        {!imageUrl && (
          <span
            className={cn(
              "font-display font-bold text-white",
              textSizeClasses[size]
            )}
          >
            {icon || displayText}
          </span>
        )}
        
        {/* Glow effect on hover */}
        <div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            boxShadow: `0 0 30px -5px ${color}60`,
          }}
        />
        
        {/* Badge */}
        {badge && (
          <div className="absolute -bottom-1 -right-1">
            {badge}
          </div>
        )}
      </div>
      
      {/* Name */}
      {showName && (
        <p
          className={cn(
            "font-medium text-foreground text-center group-hover:text-primary transition-colors",
            subtitleSizeClasses[size]
          )}
        >
          {name}
        </p>
      )}
      
      {/* Subtitle */}
      {showName && subtitle && (
        <p className="text-xs text-muted-foreground text-center mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  );
};
