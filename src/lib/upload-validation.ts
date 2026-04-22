/**
 * SECURITY: Centralized client-side upload validation.
 *
 * Defense in depth on top of bucket-level allowed_mime_types / file_size_limit
 * and storage.objects RLS. Rejects:
 *  - dangerous MIME types (text/html, image/svg+xml, application/javascript…)
 *  - oversized files
 *  - filenames with path-traversal sequences ("..", "/", "\")
 *  - extensions outside the allowed set
 *
 * Always pass the returned `contentType` and `safeExt` when calling
 * `supabase.storage.from(bucket).upload(path, file, { contentType })` so that
 * supabase-js does NOT infer the content type from the (attacker-controlled)
 * filename extension.
 */

export type UploadKind = "image" | "attachment";

const IMAGE_MIME_WHITELIST = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_EXT_WHITELIST = ["jpg", "jpeg", "png", "webp"] as const;

const ATTACHMENT_MIME_WHITELIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;
const ATTACHMENT_EXT_WHITELIST = [
  "jpg", "jpeg", "png", "webp", "gif",
  "pdf", "doc", "docx", "xls", "xlsx", "txt", "csv",
] as const;

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export interface ValidatedUpload {
  contentType: string;
  safeExt: string;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

function getSafeExtension(filename: string, allowed: readonly string[]): string | null {
  // Reject any path-traversal/separator characters in the original filename.
  if (/[\\/]|\.\./.test(filename)) return null;
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(filename);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return (allowed as readonly string[]).includes(ext) ? ext : null;
}

/**
 * Validate a File before uploading to Supabase Storage.
 * Throws UploadValidationError on rejection.
 */
export function validateUpload(file: File, kind: UploadKind): ValidatedUpload {
  const mimeWhitelist = kind === "image" ? IMAGE_MIME_WHITELIST : ATTACHMENT_MIME_WHITELIST;
  const extWhitelist = kind === "image" ? IMAGE_EXT_WHITELIST : ATTACHMENT_EXT_WHITELIST;
  const maxBytes = kind === "image" ? IMAGE_MAX_BYTES : ATTACHMENT_MAX_BYTES;

  if (!file || file.size === 0) {
    throw new UploadValidationError("Fichier vide ou invalide");
  }
  if (file.size > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    throw new UploadValidationError(`Fichier trop volumineux (max ${mb} Mo)`);
  }
  const mime = (file.type || "").toLowerCase();
  if (!mime || !(mimeWhitelist as readonly string[]).includes(mime)) {
    throw new UploadValidationError(
      kind === "image"
        ? "Format non supporté. Utilisez JPEG, PNG ou WebP."
        : "Format de fichier non autorisé."
    );
  }
  const safeExt = getSafeExtension(file.name, extWhitelist);
  if (!safeExt) {
    throw new UploadValidationError("Nom de fichier ou extension invalide.");
  }
  // Cross-check MIME ↔ extension to prevent ".jpg" wrapping text/html etc.
  const expectedExtsForMime: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "application/pdf": ["pdf"],
    "application/msword": ["doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
    "application/vnd.ms-excel": ["xls"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
    "text/plain": ["txt"],
    "text/csv": ["csv"],
  };
  const allowedExts = expectedExtsForMime[mime];
  if (allowedExts && !allowedExts.includes(safeExt)) {
    throw new UploadValidationError("L'extension ne correspond pas au type du fichier.");
  }

  return { contentType: mime, safeExt };
}