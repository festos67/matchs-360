ALTER TABLE public.profiles DISABLE TRIGGER USER;
UPDATE public.profiles SET club_id = 'e1e4f98e-8ca2-4f9a-a194-4523c0cc7de1' WHERE id = '9d51d1e3-3484-4619-bfd7-16ac6e429141';
ALTER TABLE public.profiles ENABLE TRIGGER USER;