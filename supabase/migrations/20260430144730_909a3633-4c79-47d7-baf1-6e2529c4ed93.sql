ALTER TABLE public.user_roles DISABLE TRIGGER USER;

INSERT INTO public.user_roles (user_id, role, club_id)
  VALUES ('9d51d1e3-3484-4619-bfd7-16ac6e429141', 'club_admin', 'e1e4f98e-8ca2-4f9a-a194-4523c0cc7de1')
  ON CONFLICT DO NOTHING;

ALTER TABLE public.user_roles ENABLE TRIGGER USER;

INSERT INTO public.invitations (email, invited_by, club_id, intended_role, status)
  SELECT 'patrick.spielman@gmail.org',
         '7362c441-3564-407d-8862-594e28c5bb8b',
         'e1e4f98e-8ca2-4f9a-a194-4523c0cc7de1',
         'club_admin',
         'pending'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.invitations
    WHERE email = 'patrick.spielman@gmail.org'
      AND club_id = 'e1e4f98e-8ca2-4f9a-a194-4523c0cc7de1'
      AND intended_role = 'club_admin'
  );