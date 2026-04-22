/**
 * Politique de mot de passe centralisée — alignée OWASP ASVS 2021 (V2.1.1)
 * et CNIL 2022-100.
 *
 * - USER_MIN_LENGTH (12) : tous les comptes utilisateurs (signup, reset, invite,
 *   self-service change password).
 * - ADMIN_MIN_LENGTH (14) : action admin "update-password" (reset forcé d'un
 *   autre utilisateur par un Super Admin).
 *
 * Pas de complexité forcée (NIST SP 800-63B recommande contre les règles de
 * type "1 majuscule + 1 chiffre + 1 spécial" — préférer la longueur).
 * La détection des mots de passe compromis (HIBP) est activée côté Supabase
 * Auth — elle agit en plus de cette validation côté client/edge.
 */
import { z } from "zod";

export const USER_MIN_LENGTH = 12;
export const ADMIN_MIN_LENGTH = 14;
export const MAX_LENGTH = 128;

export const PASSWORD_HELP_TEXT =
  `Au moins ${USER_MIN_LENGTH} caractères. Évitez les mots de passe déjà utilisés ailleurs.`;

export const ADMIN_PASSWORD_HELP_TEXT =
  `Au moins ${ADMIN_MIN_LENGTH} caractères pour une réinitialisation administrateur.`;

export const userPasswordSchema = z
  .string()
  .min(USER_MIN_LENGTH, `Le mot de passe doit contenir au moins ${USER_MIN_LENGTH} caractères`)
  .max(MAX_LENGTH, `Le mot de passe ne peut pas dépasser ${MAX_LENGTH} caractères`);

export const adminPasswordSchema = z
  .string()
  .min(ADMIN_MIN_LENGTH, `Le mot de passe doit contenir au moins ${ADMIN_MIN_LENGTH} caractères`)
  .max(MAX_LENGTH, `Le mot de passe ne peut pas dépasser ${MAX_LENGTH} caractères`);

/**
 * Valide un mot de passe utilisateur. Retourne `null` si valide, sinon le
 * message d'erreur à afficher.
 */
export function validateUserPassword(password: string): string | null {
  const result = userPasswordSchema.safeParse(password);
  return result.success ? null : result.error.errors[0].message;
}

export function validateAdminPassword(password: string): string | null {
  const result = adminPasswordSchema.safeParse(password);
  return result.success ? null : result.error.errors[0].message;
}