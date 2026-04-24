-- F9: Étendre l'audit log aux évaluations (table evaluations + scores + objectives)
-- Réutilise public.fn_audit_trigger() existante (cf. migration 20260422151944)

DROP TRIGGER IF EXISTS trg_audit_evaluations ON public.evaluations;
CREATE TRIGGER trg_audit_evaluations
AFTER INSERT OR UPDATE OR DELETE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_evaluation_scores ON public.evaluation_scores;
CREATE TRIGGER trg_audit_evaluation_scores
AFTER INSERT OR UPDATE OR DELETE ON public.evaluation_scores
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_evaluation_objectives ON public.evaluation_objectives;
CREATE TRIGGER trg_audit_evaluation_objectives
AFTER INSERT OR UPDATE OR DELETE ON public.evaluation_objectives
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();