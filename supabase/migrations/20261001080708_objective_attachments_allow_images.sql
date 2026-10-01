-- =====================================================================
-- Pièces jointes des objectifs : accepter aussi les images.
--
-- L'application proposait JPG, PNG, WebP et GIF, mais l'espace de stockage
-- objective-attachments ne les acceptait pas (seulement PDF, Word, Excel,
-- texte, CSV) : l'envoi d'une photo ou d'une capture d'écran échouait.
-- Les formats sont désormais alignés sur ceux de l'application
-- (src/lib/upload-validation.ts). L'espace reste privé (lecture limitée à
-- l'équipe, au joueur concerné et au staff), 25 Mo par fichier.
-- =====================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]
WHERE id = 'objective-attachments';
