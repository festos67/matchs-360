-- Add deleted_at column for soft delete on evaluations
ALTER TABLE public.evaluations 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for filtering non-deleted evaluations
CREATE INDEX idx_evaluations_deleted_at ON public.evaluations(deleted_at) WHERE deleted_at IS NULL;

-- Allow coaches to soft delete their own evaluations
CREATE POLICY "Coaches can soft delete their evaluations" 
ON public.evaluations 
FOR UPDATE 
USING (coach_id = auth.uid())
WITH CHECK (coach_id = auth.uid());