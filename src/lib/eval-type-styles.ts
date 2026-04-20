import { ClipboardCheck, User, Heart, type LucideIcon } from "lucide-react";

export type EvalType = "coach" | "self" | "supporter";

export interface EvalTypeStyle {
  bg: string;
  text: string;
  badge: string;
  border: string;
  label: string;
  icon: LucideIcon;
}

export const EVAL_TYPE_STYLES: Record<EvalType, EvalTypeStyle> = {
  coach: {
    bg: "bg-primary/5",
    text: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
    border: "border-primary/20",
    label: "Coach",
    icon: ClipboardCheck,
  },
  self: {
    bg: "bg-accent/5",
    text: "text-accent",
    badge: "bg-accent/10 text-accent border-accent/20",
    border: "border-accent/20",
    label: "Auto-éval",
    icon: User,
  },
  supporter: {
    bg: "bg-success/5",
    text: "text-success",
    badge: "bg-success/10 text-success border-success/20",
    border: "border-success/20",
    label: "Supporter",
    icon: Heart,
  },
};

export const getEvalTypeStyle = (type: EvalType): EvalTypeStyle => EVAL_TYPE_STYLES[type];
