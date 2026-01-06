import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCORE_LABELS } from "@/lib/evaluation-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-9 h-9",
};

export const StarRating = ({
  value,
  onChange,
  disabled = false,
  size = "md",
  showLabel = false,
  className,
}: StarRatingProps) => {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const displayValue = hoverValue ?? value ?? 0;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Tooltip key={star}>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "transition-all duration-150",
                disabled
                  ? "cursor-not-allowed opacity-30"
                  : "cursor-pointer hover:scale-110 active:scale-95"
              )}
              onMouseEnter={() => !disabled && setHoverValue(star)}
              onMouseLeave={() => !disabled && setHoverValue(null)}
              onClick={() => !disabled && onChange?.(star)}
            >
              <Star
                className={cn(
                  sizeClasses[size],
                  "transition-colors duration-150",
                  star <= displayValue
                    ? "fill-warning text-warning"
                    : "fill-transparent text-muted-foreground/40"
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {star} - {SCORE_LABELS[star]}
          </TooltipContent>
        </Tooltip>
      ))}
      
      {showLabel && value !== null && value > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">
          {SCORE_LABELS[Math.round(value)]}
        </span>
      )}
    </div>
  );
};