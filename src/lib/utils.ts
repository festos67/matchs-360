/**
 * @module utils
 * @description Utilitaires transverses bas niveau (UI). Centralise les helpers
 *              de styling Tailwind partagés par tous les composants.
 * @exports
 *  - cn(...inputs) : merge intelligent de classes Tailwind via clsx + twMerge
 *                    (déduplique les classes conflictuelles, ex: p-2 + p-4 → p-4)
 * @example
 *   <div className={cn("p-4 text-sm", isActive && "bg-primary", className)} />
 * @maintenance
 *  - Réservé aux helpers UI bas niveau (pas de logique métier)
 *  - Pour logique métier : voir src/lib/{evaluation-utils, framework-loader, ...}
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
