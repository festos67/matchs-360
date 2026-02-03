-- Add 'supporter_assessment' to the evaluation_type enum
ALTER TYPE public.evaluation_type ADD VALUE IF NOT EXISTS 'supporter_assessment';