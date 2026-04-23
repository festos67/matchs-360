/**
 * Composant partagé d'input mot de passe.
 *
 * Centralise l'application de la politique définie dans
 * `src/lib/password-policy.ts` (USER_MIN_LENGTH, MAX_LENGTH, helper text)
 * pour éviter la dérive de seuils hardcodés (cf. audit sécurité).
 *
 * Surfaces : Auth (signup), ResetPassword, InviteAccept, Profile (change).
 * Pour les resets administrateur (14 chars), utiliser `minLength` override.
 */
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  USER_MIN_LENGTH,
  MAX_LENGTH,
  PASSWORD_HELP_TEXT,
} from "@/lib/password-policy";

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Override pour les resets administrateur (ADMIN_MIN_LENGTH = 14). */
  minLength?: number;
  /** Override du texte d'aide (ex: ADMIN_PASSWORD_HELP_TEXT). */
  helpText?: string;
  /** Afficher la note d'aide sous l'input (défaut: true). */
  showHelpText?: boolean;
  required?: boolean;
  autoComplete?: string;
}

export function PasswordInput({
  id,
  label,
  value,
  onChange,
  placeholder = "••••••••",
  minLength = USER_MIN_LENGTH,
  helpText = PASSWORD_HELP_TEXT,
  showHelpText = true,
  required = true,
  autoComplete = "new-password",
}: PasswordInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          id={id}
          type="password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10"
          minLength={minLength}
          maxLength={MAX_LENGTH}
          required={required}
          autoComplete={autoComplete}
        />
      </div>
      {showHelpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  );
}