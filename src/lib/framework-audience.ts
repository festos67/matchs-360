/**
 * @module framework-audience
 * @description Public visé d'un modèle de référentiel de club
 *              (competence_frameworks.audience) : un club peut avoir plusieurs
 *              modèles, par exemple un pour les adultes et un pour les jeunes.
 */
import { ageCategorySuggestsMinors } from "@/lib/age-categories";

export type FrameworkAudience = "adult" | "youth" | null;

export const AUDIENCE_OPTIONS: { value: "all" | "adult" | "youth"; label: string }[] = [
  { value: "all", label: "Tous publics" },
  { value: "adult", label: "Adultes" },
  { value: "youth", label: "Jeunes" },
];

export function audienceLabel(audience: string | null | undefined): string {
  if (audience === "adult") return "Adultes";
  if (audience === "youth") return "Jeunes";
  return "Tous publics";
}

/** Valeur de formulaire ("all") ↔ valeur en base (NULL). */
export const audienceFromSelect = (v: string): FrameworkAudience =>
  v === "adult" || v === "youth" ? v : null;
export const audienceToSelect = (a: string | null | undefined): "all" | "adult" | "youth" =>
  a === "adult" || a === "youth" ? a : "all";

/** Public suggéré par la catégorie d'âge d'une équipe (null si indéterminé). */
export function audienceForAgeCategory(cat: string | null | undefined): FrameworkAudience {
  if (!cat) return null;
  if (ageCategorySuggestsMinors(cat)) return "youth";
  if (/^(U18|U19|Senior|Veteran)$/i.test(cat)) return "adult";
  return null;
}
