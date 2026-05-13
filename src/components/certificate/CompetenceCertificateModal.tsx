/**
 * @component CompetenceCertificateModal
 * @description Modale de génération d'une attestation de compétences pour un
 *              joueur. Réservée aux Coachs et Responsables Club.
 *              Workflow : formulaire → prévisualisation PDF → impression.
 * @maintenance
 *  - Catalogue compétences : src/lib/default-competences.ts
 *  - Modale standard : mem://style/ui-patterns/management-modals-standards
 *  - Identité PDF : mem://style/pdf-reports-identity
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { ArrowDown, ArrowUp, Award, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { DEFAULT_COMPETENCES, type DefaultCompetence } from "@/lib/default-competences";
import { PrintableCertificate, type CertificateCompetence } from "./PrintableCertificate";
import type { ThemeScores } from "@/lib/evaluation-utils";

const MAX_COMPETENCES = 3;

export interface CertificateRadarOption {
  evaluationId: string;
  label: string;
  themeScores: ThemeScores[];
}

interface CompetenceCertificateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  clubName: string;
  clubLogoUrl?: string | null;
  clubPrimaryColor?: string;
  defaultGuarantorName?: string;
  radarOptions?: CertificateRadarOption[];
}

export function CompetenceCertificateModal({
  open, onOpenChange,
  playerName, clubName, clubLogoUrl, clubPrimaryColor,
  defaultGuarantorName = "",
  radarOptions = [],
}: CompetenceCertificateModalProps) {
  const [guarantor, setGuarantor] = useState(defaultGuarantorName);
  const [period, setPeriod] = useState("");
  const [competences, setCompetences] = useState<CertificateCompetence[]>([]);
  const [message, setMessage] = useState("");
  const [includeRadar, setIncludeRadar] = useState(false);
  const [radarChoice, setRadarChoice] = useState<string>("");

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [askEditAfter, setAskEditAfter] = useState(false);
  const [askSaveAfter, setAskSaveAfter] = useState(false);

  const [catalogOpen, setCatalogOpen] = useState(false);
  // true = à ajouter, false = à retirer (compétence déjà présente décochée),
  // absent = pas de changement
  const [catalogSelection, setCatalogSelection] = useState<Record<string, boolean>>({});
  const catalogScrollRef = useRef<HTMLDivElement>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setGuarantor(defaultGuarantorName);
    }
  }, [open, defaultGuarantorName]);

  useEffect(() => {
    if (radarOptions.length > 0 && !radarChoice) {
      setRadarChoice(radarOptions[0].evaluationId);
    }
  }, [radarOptions, radarChoice]);

  const isDirty = useMemo(() =>
    guarantor !== defaultGuarantorName || period !== "" || competences.length > 0 ||
    message !== "" || includeRadar,
  [guarantor, defaultGuarantorName, period, competences, message, includeRadar]);

  const resetAll = () => {
    setGuarantor(defaultGuarantorName);
    setPeriod("");
    setCompetences([]);
    setMessage("");
    setIncludeRadar(false);
    setRadarChoice(radarOptions[0]?.evaluationId || "");
  };

  const handleClose = (force = false) => {
    if (!force && isDirty) {
      setShowCancelConfirm(true);
      return;
    }
    onOpenChange(false);
    setTimeout(() => {
      resetAll();
      setShowPreview(false);
    }, 200);
  };

  const addFromCatalog = (c: DefaultCompetence) => {
    if (competences.length >= MAX_COMPETENCES) {
      toast.warning(`Maximum ${MAX_COMPETENCES} compétences.`);
      return;
    }
    if (competences.some(x => x.name.toLowerCase() === c.name.toLowerCase())) {
      toast.info("Compétence déjà ajoutée.");
      return;
    }
    setCompetences(prev => [...prev, { ...c }]);
  };

  const handleAddSelected = () => {
    const toRemove = new Set(
      Object.entries(catalogSelection)
        .filter(([, v]) => v === false)
        .map(([k]) => k.toLowerCase())
    );
    const toAdd = DEFAULT_COMPETENCES.filter(c => catalogSelection[c.name] === true);

    if (toRemove.size === 0 && toAdd.length === 0) {
      setCatalogSelection({});
      setCatalogOpen(false);
      return;
    }
    setCompetences(prev => {
      const kept = prev.filter(x => !toRemove.has(x.name.toLowerCase()));
      const next = [...kept];
      for (const c of toAdd) {
        if (next.length >= MAX_COMPETENCES) {
          toast.warning(`Maximum ${MAX_COMPETENCES} compétences atteint.`);
          break;
        }
        if (next.some(x => x.name.toLowerCase() === c.name.toLowerCase())) continue;
        next.push({ ...c });
      }
      return next;
    });
    setCatalogSelection({});
    setCatalogOpen(false);
  };

  const addBlank = () => {
    if (competences.length >= MAX_COMPETENCES) {
      toast.warning(`Maximum ${MAX_COMPETENCES} compétences.`);
      return;
    }
    setCompetences(prev => [...prev, { name: "", definition: "" }]);
  };

  const updateComp = (idx: number, patch: Partial<CertificateCompetence>) => {
    setCompetences(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  };

  const removeComp = (idx: number) => {
    setCompetences(prev => prev.filter((_, i) => i !== idx));
  };

  const moveComp = (idx: number, dir: -1 | 1) => {
    setCompetences(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const validateForm = (): string | null => {
    if (!guarantor.trim()) return "Le nom du garant est obligatoire.";
    return null;
  };

  const handleValidate = () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }
    setShowPreview(true);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Attestation_${playerName.replace(/\s+/g, "_")}_${new Date().toLocaleDateString("fr-FR")}`,
  });

  const selectedRadar = radarOptions.find(r => r.evaluationId === radarChoice) || null;

  const cleanedCompetences = competences.filter(c => c.name.trim());

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="max-w-2xl h-[85vh] max-h-[85vh] flex flex-col overflow-hidden p-0"
          onPointerDownOutside={(e) => { e.preventDefault(); if (isDirty) setShowCancelConfirm(true); else handleClose(true); }}
          onEscapeKeyDown={(e) => { e.preventDefault(); if (isDirty) setShowCancelConfirm(true); else handleClose(true); }}
        >
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-green-600" />
              Attestation de compétences — {playerName}
            </DialogTitle>
            <DialogDescription>
              Renseignez les indicateurs ci-dessous. Tous les éléments saisis figureront sur le diplôme.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4">
            <div className="space-y-5">
              {/* Garant */}
              <div className="space-y-1.5">
                <Label htmlFor="cert-guarantor">
                  Nom du garant <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cert-guarantor"
                  value={guarantor}
                  onChange={(e) => setGuarantor(e.target.value)}
                  placeholder="Nom de la personne se portant garant"
                />
              </div>

              {/* Période */}
              <div className="space-y-1.5">
                <Label htmlFor="cert-period">Période d'accompagnement (facultatif)</Label>
                <Input
                  id="cert-period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="Ex. Septembre 2024 — Juin 2025"
                />
              </div>

              {/* Compétences */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Compétences observées <span className="text-muted-foreground text-xs">(facultatif)</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({competences.length}/{MAX_COMPETENCES})
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Popover open={catalogOpen} onOpenChange={setCatalogOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Modèle
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-80 p-0"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        <div
                          ref={catalogScrollRef}
                          className="h-72 overflow-y-auto overscroll-contain p-2 space-y-1"
                        >
                          {(() => {
                            const committedKept = competences.filter(
                              x => catalogSelection[x.name] !== false
                            ).length;
                            const newPicked = DEFAULT_COMPETENCES.filter(c => {
                              const already = competences.some(x => x.name.toLowerCase() === c.name.toLowerCase());
                              return !already && catalogSelection[c.name] === true;
                            }).length;
                            const remainingSlots = MAX_COMPETENCES - committedKept - newPicked;
                            return DEFAULT_COMPETENCES.map((c) => {
                              const already = competences.some(x => x.name.toLowerCase() === c.name.toLowerCase());
                              const sel = catalogSelection[c.name];
                              const checked = already ? sel !== false : sel === true;
                              const capReached = !checked && remainingSlots <= 0;
                              const disabled = capReached;
                              return (
                              <label
                                key={c.name}
                                className={`flex items-start gap-2 p-2 rounded-md cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "hover:bg-muted"}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  onCheckedChange={(v) => setCatalogSelection(prev => {
                                    const next = { ...prev };
                                    const isChecked = !!v;
                                    if (already) {
                                      // déjà présente : false = à retirer, sinon état neutre
                                      if (isChecked) delete next[c.name];
                                      else next[c.name] = false;
                                    } else {
                                      if (isChecked) next[c.name] = true;
                                      else delete next[c.name];
                                    }
                                    return next;
                                  })}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold text-primary">{c.name}</div>
                                  <div className="text-[11px] text-muted-foreground line-clamp-2">{c.definition}</div>
                                </div>
                              </label>
                              );
                            });
                          })()}
                        </div>
                        <div className="border-t p-2 flex justify-end bg-muted/30">
                          <Button type="button" size="sm" onClick={handleAddSelected} className="gap-1.5">
                            <Plus className="w-3.5 h-3.5" /> Ajouter
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addBlank}>
                      <Plus className="w-3.5 h-3.5" /> Vierge
                    </Button>
                  </div>
                </div>

                {competences.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic border border-dashed rounded-md p-4 text-center">
                    Ajoutez au moins une compétence depuis le catalogue ou créez une étiquette vierge.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {competences.map((c, idx) => (
                      <div key={idx} className="border rounded-lg p-2.5 bg-card">
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                              disabled={idx === 0}
                              onClick={() => moveComp(idx, -1)}
                              aria-label="Monter">
                              <ArrowUp className="w-3 h-3" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                              disabled={idx === competences.length - 1}
                              onClick={() => moveComp(idx, 1)}
                              aria-label="Descendre">
                              <ArrowDown className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <Input
                              value={c.name}
                              onChange={(e) => updateComp(idx, { name: e.target.value })}
                              placeholder="Nom de la compétence"
                              className="h-8 text-sm font-semibold"
                            />
                            <Textarea
                              value={c.definition}
                              onChange={(e) => updateComp(idx, { definition: e.target.value.slice(0, 180) })}
                              placeholder="Comportement observé"
                              rows={2}
                              maxLength={180}
                              className="text-xs"
                            />
                            <div className="text-[10px] text-muted-foreground text-right">
                              {c.definition.length}/180
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10" onClick={() => removeComp(idx)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="cert-message">Message complémentaire (facultatif)</Label>
                <Textarea
                  id="cert-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 300))}
                  placeholder="Mot personnalisé, encouragement, contexte particulier…"
                  rows={3}
                  maxLength={300}
                />
                <div className="text-[10px] text-muted-foreground text-right">
                  {message.length}/300
                </div>
              </div>

              {/* Radar */}
              {radarOptions.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cert-radar"
                      checked={includeRadar}
                      onCheckedChange={(v) => setIncludeRadar(!!v)}
                    />
                    <Label htmlFor="cert-radar" className="cursor-pointer">
                      Souhaitez-vous ajouter le dernier diagramme du joueur ?
                    </Label>
                  </div>
                  {includeRadar && (
                    <Select value={radarChoice} onValueChange={setRadarChoice}>
                      <SelectTrigger><SelectValue placeholder="Choisir un débrief" /></SelectTrigger>
                      <SelectContent>
                        {radarOptions.map(r => (
                          <SelectItem key={r.evaluationId} value={r.evaluationId}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t bg-muted/30">
            <Button type="button" variant="outline" onClick={() => handleClose()}>
              Annuler
            </Button>
            <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleValidate}>
              <Award className="w-4 h-4 mr-1.5" /> Générer l'aperçu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm cancel */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la saisie ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les informations saisies seront perdues. Souhaitez-vous poursuivre la saisie ou abandonner ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Poursuivre la saisie</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowCancelConfirm(false); handleClose(true); }}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={(v) => { if (!v) setShowPreview(false); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-green-600" /> Prévisualisation de l'attestation
            </DialogTitle>
            <DialogDescription>Vérifiez le rendu avant impression ou enregistrement PDF.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 bg-muted/40 p-4">
            <div className="mx-auto bg-white shadow-lg" style={{ width: "297mm", transform: "scale(0.6)", transformOrigin: "top center" }}>
              <PrintableCertificate
                ref={printRef}
                playerName={playerName}
                clubName={clubName}
                clubLogoUrl={clubLogoUrl}
                clubPrimaryColor={clubPrimaryColor}
                guarantorName={guarantor}
                accompanimentPeriod={period.trim() || null}
                competences={cleanedCompetences}
                additionalMessage={message.trim() || null}
                radarThemeScores={includeRadar && selectedRadar ? selectedRadar.themeScores : null}
                radarLabel={includeRadar && selectedRadar ? selectedRadar.label : null}
              />
            </div>
          </ScrollArea>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30">
            <Button type="button" variant="outline" onClick={() => setAskEditAfter(true)}>
              Souhaitez-vous modifier ?
            </Button>
            <Button type="button" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setAskSaveAfter(true)}>
              Enregistrer / Imprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ask: edit again ? */}
      <AlertDialog open={askEditAfter} onOpenChange={setAskEditAfter}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier l'attestation ?</AlertDialogTitle>
            <AlertDialogDescription>Souhaitez-vous encore faire des modifications ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAskEditAfter(false)}>Non</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAskEditAfter(false); setShowPreview(false); }}>
              Oui, revenir au formulaire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ask: save ? */}
      <AlertDialog open={askSaveAfter} onOpenChange={setAskSaveAfter}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enregistrer le résultat ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'attestation sera ouverte dans la boîte de dialogue d'impression de votre navigateur.
              Vous pourrez l'enregistrer en PDF ou l'imprimer directement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAskSaveAfter(false)}>Non</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => { setAskSaveAfter(false); handlePrint(); }}
            >
              Oui, imprimer / enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}