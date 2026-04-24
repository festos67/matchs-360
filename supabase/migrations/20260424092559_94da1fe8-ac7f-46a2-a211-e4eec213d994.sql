ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clubs_description_length_chk'
  ) THEN
    ALTER TABLE public.clubs
      ADD CONSTRAINT clubs_description_length_chk
      CHECK (description IS NULL OR length(description) <= 1000);
  END IF;
END $$;

COMMENT ON COLUMN public.clubs.description IS
  'Texte libre de présentation du club (max 1000 caractères, optionnel).';