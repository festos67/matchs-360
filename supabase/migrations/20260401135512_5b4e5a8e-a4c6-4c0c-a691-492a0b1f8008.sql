
-- Create user-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-photos', 'user-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "User photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-photos');

-- Users can upload their own photo
CREATE POLICY "Users can upload their own photo"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own photo
CREATE POLICY "Users can update their own photo"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own photo
CREATE POLICY "Users can delete their own photo"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Admins can manage all user photos
CREATE POLICY "Admins can manage all user photos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'user-photos' 
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'user-photos' 
  AND public.is_admin(auth.uid())
);
