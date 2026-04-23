/**
 * SECURITY / DELIVERABILITY: Centralized email sender configuration.
 *
 * Single source of truth for the `from:` address used by ALL outbound
 * emails sent via Resend. Reading from env var `RESEND_FROM_EMAIL` (with
 * a safe default aligned on the project's custom domain) prevents the
 * sandbox `onboarding@resend.dev` from leaking into production flows
 * (silently dropped to non-verified recipients + spoofing surface).
 *
 * Rules enforced:
 *  - The address MUST NOT use the shared sandbox domain `resend.dev`.
 *  - The address MUST be a syntactically valid `Display Name <local@domain>`
 *    or bare `local@domain`.
 *  - If RESEND_FROM_EMAIL is missing, fall back to the verified custom
 *    sender used by send-invitation (`noreply@notify.match360.com`)
 *    branded as MATCHS360.
 */

const DEFAULT_FROM = "MATCHS360 <noreply@notify.match360.com>";
const FORBIDDEN_DOMAINS = ["resend.dev"];

function extractEmail(from: string): string | null {
  // Accepts "Name <user@domain>" or "user@domain".
  const angle = from.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : from).trim();
  // Minimal RFC-5322-ish check (intentionally strict, no quoted locals).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

export function getFromEmail(): string {
  const raw = (Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
  const value = raw.length > 0 ? raw : DEFAULT_FROM;

  const email = extractEmail(value);
  if (!email) {
    throw new Error(
      "RESEND_FROM_EMAIL is malformed (expected 'Name <user@domain>' or 'user@domain')",
    );
  }

  const domain = email.split("@")[1];
  if (FORBIDDEN_DOMAINS.includes(domain)) {
    throw new Error(
      `RESEND_FROM_EMAIL uses forbidden sandbox domain '${domain}'. ` +
        "Configure a verified custom domain (e.g. notify.match360.com).",
    );
  }

  return value;
}