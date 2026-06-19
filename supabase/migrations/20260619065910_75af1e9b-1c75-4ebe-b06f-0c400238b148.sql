ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS reminder_j3_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_j1_sent_at timestamptz;

COMMENT ON COLUMN public.invitations.reminder_j3_sent_at IS 'Horodatage envoi rappel J-3 (NULL = non envoye). Ecrit par send-invitation-reminders.';
COMMENT ON COLUMN public.invitations.reminder_j1_sent_at IS 'Horodatage envoi rappel J-1 (NULL = non envoye). Ecrit par send-invitation-reminders.';