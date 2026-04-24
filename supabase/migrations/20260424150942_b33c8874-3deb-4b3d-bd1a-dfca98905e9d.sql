-- F-409 — Prevent overwrite attacks on objective-attachments bucket.
-- The app always generates a new crypto.randomUUID() filename for uploads, so storage UPDATE
-- (triggered by upsert:true) is never required. Removing it forces all changes to go through
-- INSERT (new path) + DELETE (cleanup), which prevents a malicious coach from replacing
-- another coach's file content while keeping the legitimate file_name/file_type metadata.

DROP POLICY IF EXISTS "objective-attachments scoped update" ON storage.objects;
