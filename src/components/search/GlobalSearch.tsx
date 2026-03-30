import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, User, Loader2, Building2, UserCog } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";

type ResultType = "player" | "team" | "club" | "coach";
type FilterType = "all" | ResultType;

interface SearchResult {
  id: string;
  type: ResultType;
  name: string;
  subtitle?: string;
}

const FILTERS: { value: FilterType; label: string; icon: React.ElementType }[] = [
  { value: "all", label: "Tout", icon: Search },
  { value: "club", label: "Clubs", icon: Building2 },
  { value: "team", label: "Équipes", icon: Users },
  { value: "coach", label: "Coachs", icon: UserCog },
  { value: "player", label: "Joueurs", icon: User },
];

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setFilter("all");
      setResults([]);
    }
  }, [open]);

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
        const shouldSearch = (type: ResultType) => filter === "all" || filter === type;

        // Search clubs
        if (shouldSearch("club")) {
          const { data: clubs } = await supabase
            .from("clubs")
            .select("id, name, short_name")
            .is("deleted_at", null)
            .or(`name.ilike.${searchTerm},short_name.ilike.${searchTerm}`)
            .limit(5);

          if (clubs) {
            clubs.forEach((club) => {
              searchResults.push({
                id: club.id,
                type: "club",
                name: club.name,
                subtitle: club.short_name || undefined,
              });
            });
          }
        }

        // Search teams
        if (shouldSearch("team")) {
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
        }

        // Search coaches
        if (shouldSearch("coach")) {
          const { data: coaches } = await supabase
            .from("profiles")
            .select(`
              id, first_name, last_name, nickname,
              team_members!inner(member_type, is_active, teams(name))
            `)
            .eq("team_members.member_type", "coach")
            .eq("team_members.is_active", true)
            .is("deleted_at", null)
            .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},nickname.ilike.${searchTerm}`)
            .limit(5);

          if (coaches) {
            coaches.forEach((coach) => {
              const name = [coach.first_name, coach.last_name].filter(Boolean).join(" ") || coach.nickname || "Coach";
              const teamNames = coach.team_members
                ?.map((tm: any) => tm.teams?.name)
                .filter(Boolean)
                .join(", ");
              searchResults.push({
                id: coach.id,
                type: "coach",
                name,
                subtitle: teamNames || undefined,
              });
            });
          }
        }

        // Search players
        if (shouldSearch("player")) {
          const { data: players } = await supabase
            .from("profiles")
            .select(`
              id, first_name, last_name, nickname,
              team_members!inner(member_type, is_active, teams(name))
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
        }

        setResults(searchResults);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query, filter]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    switch (result.type) {
      case "player":
      case "coach":
        navigate(`/players/${result.id}`);
        break;
      case "team":
        navigate(`/teams/${result.id}`);
        break;
      case "club":
        navigate(`/clubs/${result.id}`);
        break;
    }
  };

  const iconForType = (type: ResultType) => {
    switch (type) {
      case "club": return <Building2 className="w-4 h-4 text-primary" />;
      case "team": return <Users className="w-4 h-4 text-primary" />;
      case "coach": return <UserCog className="w-4 h-4 text-primary" />;
      case "player": return <User className="w-4 h-4 text-primary" />;
    }
  };

  const headingForType = (type: ResultType) => {
    switch (type) {
      case "club": return "Clubs";
      case "team": return "Équipes";
      case "coach": return "Coachs";
      case "player": return "Joueurs";
    }
  };

  const groupedResults = (types: ResultType[]) =>
    types
      .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
      .filter((g) => g.items.length > 0);

  const groups = groupedResults(
    filter === "all" ? ["club", "team", "coach", "player"] : [filter]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full md:w-96 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-transparent hover:border-primary/30 transition-colors text-left min-w-0"
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1">
          Rechercher...
        </span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg">
          <VisuallyHidden>
            <DialogTitle>Recherche globale</DialogTitle>
          </VisuallyHidden>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput
              placeholder="Rechercher un club, une équipe, un coach, un joueur..."
              value={query}
              onValueChange={setQuery}
            />

            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    filter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <f.icon className="w-3 h-3" />
                  {f.label}
                </button>
              ))}
            </div>

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

              {!loading &&
                groups.map((group) => (
                  <CommandGroup key={group.type} heading={headingForType(group.type)}>
                    {group.items.map((result) => (
                      <CommandItem
                        key={`${result.type}-${result.id}`}
                        value={`${result.type}-${result.name}`}
                        onSelect={() => handleSelect(result)}
                        className="flex items-center gap-3 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {iconForType(result.type)}
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
                ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};
