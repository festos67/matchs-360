-- Create a table for role requests pending admin approval
CREATE TABLE public.role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, requested_role)
);

-- Enable RLS
ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users view own requests"
ON public.role_requests
FOR SELECT
USING (user_id = auth.uid());

-- Users can create their own requests (only during signup)
CREATE POLICY "Users create own requests"
ON public.role_requests
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can view all requests
CREATE POLICY "Admins view all requests"
ON public.role_requests
FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can update requests (approve/reject)
CREATE POLICY "Admins manage requests"
ON public.role_requests
FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_role_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_role_requests_updated_at
BEFORE UPDATE ON public.role_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_role_requests_updated_at();