/**
 * @component CertificatePlayerPickerDialog
 * @description Dialog déclenché depuis la sidebar (raccourci coach / club admin)
 *              pour sélectionner un joueur puis naviguer vers sa fiche
 *              avec ?certificate=1, ce qui ouvre la modale d'attestation.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

interface CertificatePlayerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CertificatePlayerPickerDialog({ open, onOpenChange }: CertificatePlayerPickerDialogProps) {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("deleted_at", null);
      const ids = Array.from(new Set((members || []).map((m: any) => m.user_id))).filter(Boolean);
      if (ids.length === 0) { setPlayers([]); setLoading(false); return; }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", ids)
        .is("deleted_at", null);
      setPlayers((profiles as PlayerRow[]) || []);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(p => {
      const full = `${p.first_name || ""} ${p.last_name || ""} ${p.nickname || ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [players, search]);

  const displayName = (p: PlayerRow) => {
    const fn = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    return fn || p.nickname || "Joueur";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-green-600" />
            Attestation de compétences
          </DialogTitle>
          <DialogDescription>
            Choisissez le joueur pour lequel générer l'attestation.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un joueur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Aucun joueur trouvé.</div>
          ) : (
            <div className="space-y-1 py-1">
              {filtered.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm font-medium"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/players/${p.id}?certificate=1`);
                  }}
                >
                  {displayName(p)}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}