import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, User, Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";

interface SearchResult {
  id: string;
  type: "player" | "team";
  name: string;
  subtitle?: string;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Keyboard shortcut to open search
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];
        const searchTerm = `%${query}%`;

        // Search players
        const { data: players } = await supabase
          .from("profiles")
          .select(`
            id,
            first_name,
            last_name,
            nickname,
            team_members!inner(
              team_id,
              member_type,
              is_active,
              teams(name)
            )
          `)
          .eq("team_members.member_type", "player")
          .eq("team_members.is_active", true)
          .is("deleted_at", null)
          .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},nickname.ilike.${searchTerm}`)
          .limit(5);

        if (players) {
          players.forEach((player) => {
            const name = player.nickname || 
              [player.first_name, player.last_name].filter(Boolean).join(" ") || 
              "Joueur";
            const teamName = player.team_members?.[0]?.teams?.name;
            searchResults.push({
              id: player.id,
              type: "player",
              name,
              subtitle: teamName,
            });
          });
        }

        // Search teams
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name, clubs(name)")
          .is("deleted_at", null)
          .ilike("name", searchTerm)
          .limit(5);

        if (teams) {
          teams.forEach((team) => {
            searchResults.push({
              id: team.id,
              type: "team",
              name: team.name,
              subtitle: team.clubs?.name,
            });
          });
        }

        setResults(searchResults);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (result.type === "player") {
      navigate(`/players/${result.id}`);
    } else {
      navigate(`/teams/${result.id}`);
    }
  };

  return (
    <>
      {/* Search trigger */}
      <button
        onClick={() => setOpen(true)}
        className="relative w-96 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-transparent hover:border-primary/30 transition-colors text-left"
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1">
          Rechercher un joueur, une équipe...
        </span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      {/* Search dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Rechercher un joueur, une équipe..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          
          {!loading && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>Aucun résultat trouvé</CommandEmpty>
          )}

          {!loading && query.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Tapez au moins 2 caractères pour rechercher
            </div>
          )}

          {!loading && results.filter(r => r.type === "player").length > 0 && (
            <CommandGroup heading="Joueurs">
              {results
                .filter((r) => r.type === "player")
                .map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleSelect(result)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{result.name}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}

          {!loading && results.filter(r => r.type === "team").length > 0 && (
            <CommandGroup heading="Équipes">
              {results
                .filter((r) => r.type === "team")
                .map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={() => handleSelect(result)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Users className="w-4 h-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{result.name}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate">
                          {result.subtitle}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};
