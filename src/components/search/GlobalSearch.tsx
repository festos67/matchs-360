import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, User, Loader2, Building2, UserCog, ChevronDown, Check, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ResultType = "player" | "team" | "club" | "coach";

interface SearchResult {
  id: string;
  type: ResultType;
  name: string;
  subtitle?: string;
}

interface FilterOption {
  id: string;
  name: string;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Filter selections
  const [selectedClubs, setSelectedClubs] = useState<FilterOption[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<FilterOption[]>([]);
  const [selectedCoaches, setSelectedCoaches] = useState<FilterOption[]>([]);

  // Filter options loaded from DB
  const [clubOptions, setClubOptions] = useState<FilterOption[]>([]);
  const [teamOptions, setTeamOptions] = useState<FilterOption[]>([]);
  const [coachOptions, setCoachOptions] = useState<FilterOption[]>([]);
  const [loadingFilters, setLoadingFilters] = useState<string | null>(null);

  // Popover states
  const [clubPopover, setClubPopover] = useState(false);
  const [teamPopover, setTeamPopover] = useState(false);
  const [coachPopover, setCoachPopover] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedClubs([]);
      setSelectedTeams([]);
      setSelectedCoaches([]);
    }
  }, [open]);

  // Load clubs when popover opens
  const loadClubs = useCallback(async () => {
    if (clubOptions.length > 0) return;
    setLoadingFilters("club");
    const { data } = await supabase
      .from("clubs")
      .select("id, name")
      .is("deleted_at", null)
      .order("name");
    setClubOptions((data || []).map((c) => ({ id: c.id, name: c.name })));
    setLoadingFilters(null);
  }, [clubOptions.length]);

  // Load teams, filtered by selected clubs
  const loadTeams = useCallback(async () => {
    setLoadingFilters("team");
    let q = supabase
      .from("teams")
      .select("id, name, club_id")
      .is("deleted_at", null)
      .order("name");
    if (selectedClubs.length > 0) {
      q = q.in("club_id", selectedClubs.map((c) => c.id));
    }
    const { data } = await q;
    setTeamOptions((data || []).map((t) => ({ id: t.id, name: t.name })));
    setLoadingFilters(null);
  }, [selectedClubs]);

  // Load coaches, filtered by selected teams/clubs
  const loadCoaches = useCallback(async () => {
    setLoadingFilters("coach");
    let q = supabase
      .from("team_members")
      .select("user_id, teams!inner(id, club_id), profiles:user_id(first_name, last_name)")
      .eq("member_type", "coach")
      .eq("is_active", true);

    if (selectedTeams.length > 0) {
      q = q.in("team_id", selectedTeams.map((t) => t.id));
    } else if (selectedClubs.length > 0) {
      q = q.in("teams.club_id", selectedClubs.map((c) => c.id));
    }

    const { data } = await q;
    const uniqueCoaches = new Map<string, string>();
    (data || []).forEach((tm: any) => {
      if (!uniqueCoaches.has(tm.user_id)) {
        const name = [tm.profiles?.first_name, tm.profiles?.last_name].filter(Boolean).join(" ") || "Coach";
        uniqueCoaches.set(tm.user_id, name);
      }
    });
    setCoachOptions(
      Array.from(uniqueCoaches.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setLoadingFilters(null);
  }, [selectedClubs, selectedTeams]);

  // Search based on query + filters
  useEffect(() => {
    const hasFilters = selectedClubs.length > 0 || selectedTeams.length > 0 || selectedCoaches.length > 0;
    if (!query.trim() && !hasFilters) {
      setResults([]);
      return;
    }
    if (query.trim() && query.length < 2) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];
        const searchTerm = query.trim() ? `%${query}%` : null;

        // Build team ID filter from clubs if needed
        let teamIdFilter: string[] | null = null;
        if (selectedTeams.length > 0) {
          teamIdFilter = selectedTeams.map((t) => t.id);
        } else if (selectedClubs.length > 0) {
          const { data: teamData } = await supabase
            .from("teams")
            .select("id")
            .in("club_id", selectedClubs.map((c) => c.id))
            .is("deleted_at", null);
          teamIdFilter = (teamData || []).map((t) => t.id);
        }

        // Build player user ID filter from coaches
        let playerIdFilter: string[] | null = null;
        if (selectedCoaches.length > 0) {
          const { data: coachTeams } = await supabase
            .from("team_members")
            .select("team_id")
            .in("user_id", selectedCoaches.map((c) => c.id))
            .eq("member_type", "coach")
            .eq("is_active", true);
          const coachTeamIds = (coachTeams || []).map((t) => t.team_id);
          if (coachTeamIds.length > 0) {
            const { data: playerMembers } = await supabase
              .from("team_members")
              .select("user_id")
              .in("team_id", coachTeamIds)
              .eq("member_type", "player")
              .eq("is_active", true);
            playerIdFilter = [...new Set((playerMembers || []).map((p) => p.user_id))];
          } else {
            playerIdFilter = [];
          }
        }

        // Search clubs (only if no team/coach filter active)
        if (!selectedTeams.length && !selectedCoaches.length) {
          let clubQ = supabase
            .from("clubs")
            .select("id, name, short_name")
            .is("deleted_at", null);
          if (selectedClubs.length > 0) {
            clubQ = clubQ.in("id", selectedClubs.map((c) => c.id));
          }
          if (searchTerm) {
            clubQ = clubQ.or(`name.ilike.${searchTerm},short_name.ilike.${searchTerm}`);
          }
          const { data: clubs } = await clubQ.limit(5);
          (clubs || []).forEach((club) => {
            searchResults.push({ id: club.id, type: "club", name: club.name, subtitle: club.short_name || undefined });
          });
        }

        // Search teams
        if (!selectedCoaches.length) {
          let teamQ = supabase
            .from("teams")
            .select("id, name, clubs(name)")
            .is("deleted_at", null);
          if (teamIdFilter) {
            teamQ = teamQ.in("id", teamIdFilter);
          }
          if (searchTerm) {
            teamQ = teamQ.ilike("name", searchTerm);
          }
          const { data: teams } = await teamQ.limit(5);
          (teams || []).forEach((team) => {
            searchResults.push({ id: team.id, type: "team", name: team.name, subtitle: team.clubs?.name });
          });
        }

        // Search coaches
        {
          let coachQ = supabase
            .from("profiles")
            .select("id, first_name, last_name, nickname, team_members!inner(member_type, is_active, teams(name))")
            .eq("team_members.member_type", "coach")
            .eq("team_members.is_active", true)
            .is("deleted_at", null);
          if (selectedCoaches.length > 0) {
            coachQ = coachQ.in("id", selectedCoaches.map((c) => c.id));
          } else if (teamIdFilter) {
            coachQ = coachQ.in("team_members.team_id", teamIdFilter);
          }
          if (searchTerm) {
            coachQ = coachQ.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},nickname.ilike.${searchTerm}`);
          }
          const { data: coaches } = await coachQ.limit(5);
          (coaches || []).forEach((coach) => {
            const name = [coach.first_name, coach.last_name].filter(Boolean).join(" ") || coach.nickname || "Coach";
            const teamNames = coach.team_members?.map((tm: any) => tm.teams?.name).filter(Boolean).join(", ");
            searchResults.push({ id: coach.id, type: "coach", name, subtitle: teamNames || undefined });
          });
        }

        // Search players
        {
          let playerQ = supabase
            .from("profiles")
            .select("id, first_name, last_name, nickname, team_members!inner(member_type, is_active, teams(name))")
            .eq("team_members.member_type", "player")
            .eq("team_members.is_active", true)
            .is("deleted_at", null);
          if (playerIdFilter !== null) {
            if (playerIdFilter.length === 0) {
              // No players match coach filter
            } else {
              playerQ = playerQ.in("id", playerIdFilter);
            }
          } else if (teamIdFilter) {
            playerQ = playerQ.in("team_members.team_id", teamIdFilter);
          }
          if (searchTerm) {
            playerQ = playerQ.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},nickname.ilike.${searchTerm}`);
          }
          if (playerIdFilter === null || playerIdFilter.length > 0) {
            const { data: players } = await playerQ.limit(5);
            (players || []).forEach((player) => {
              const name = player.nickname || [player.first_name, player.last_name].filter(Boolean).join(" ") || "Joueur";
              const teamName = player.team_members?.[0]?.teams?.name;
              searchResults.push({ id: player.id, type: "player", name, subtitle: teamName });
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
  }, [query, selectedClubs, selectedTeams, selectedCoaches]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
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

  const toggleFilter = (
    item: FilterOption,
    selected: FilterOption[],
    setSelected: React.Dispatch<React.SetStateAction<FilterOption[]>>
  ) => {
    const isSelected = selected.some((s) => s.id === item.id);
    if (isSelected) {
      setSelected(selected.filter((s) => s.id !== item.id));
    } else {
      setSelected([...selected, item]);
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

  const groups = (["club", "team", "coach", "player"] as ResultType[])
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0);

  const totalFilters = selectedClubs.length + selectedTeams.length + selectedCoaches.length;

  const renderFilterPopover = (
    label: string,
    icon: React.ElementType,
    isOpen: boolean,
    setIsOpen: (v: boolean) => void,
    options: FilterOption[],
    selected: FilterOption[],
    setSelected: React.Dispatch<React.SetStateAction<FilterOption[]>>,
    onOpen: () => void,
    filterLoading: boolean
  ) => {
    const Icon = icon;
    return (
      <Popover open={isOpen} onOpenChange={(v) => { setIsOpen(v); if (v) onOpen(); }}>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
              selected.length > 0
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground border-border"
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
            {selected.length > 0 && (
              <span className="bg-primary-foreground/20 text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
                {selected.length}
              </span>
            )}
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <div className="max-h-48 overflow-y-auto py-1">
            {filterLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : options.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun élément</p>
            ) : (
              options.map((opt) => {
                const isChecked = selected.some((s) => s.id === opt.id);
                return (
                  <button
                    key={opt.id}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left cursor-pointer"
                    onClick={() => toggleFilter(opt, selected, setSelected)}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      isChecked ? "bg-primary border-primary" : "border-border"
                    }`}>
                      {isChecked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{opt.name}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="border-t px-3 py-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => setSelected([])}
              >
                Tout désélectionner
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full md:w-96 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-transparent hover:border-primary/30 transition-colors text-left min-w-0"
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1">Rechercher...</span>
        <kbd className="hidden md:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl h-[560px] flex flex-col">
          <VisuallyHidden>
            <DialogTitle>Recherche globale</DialogTitle>
          </VisuallyHidden>
          <Command shouldFilter={false} className="flex flex-col h-full [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput
              placeholder="Rechercher un club, une équipe, un coach, un joueur..."
              value={query}
              onValueChange={setQuery}
            />

            {/* Filter row */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border flex-wrap">
              {renderFilterPopover("Clubs", Building2, clubPopover, setClubPopover, clubOptions, selectedClubs, setSelectedClubs, loadClubs, loadingFilters === "club")}
              {renderFilterPopover("Équipes", Users, teamPopover, setTeamPopover, teamOptions, selectedTeams, setSelectedTeams, loadTeams, loadingFilters === "team")}
              {renderFilterPopover("Coachs", UserCog, coachPopover, setCoachPopover, coachOptions, selectedCoaches, setSelectedCoaches, loadCoaches, loadingFilters === "coach")}
              {totalFilters > 0 && (
                <button
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={() => { setSelectedClubs([]); setSelectedTeams([]); setSelectedCoaches([]); }}
                >
                  <X className="w-3 h-3" />
                  Effacer
                </button>
              )}
            </div>

            {/* Active filter badges */}
            {totalFilters > 0 && (
              <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-border">
                {selectedClubs.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => toggleFilter(c, selectedClubs, setSelectedClubs)}>
                    <Building2 className="w-2.5 h-2.5" />{c.name}<X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
                {selectedTeams.map((t) => (
                  <Badge key={t.id} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => toggleFilter(t, selectedTeams, setSelectedTeams)}>
                    <Users className="w-2.5 h-2.5" />{t.name}<X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
                {selectedCoaches.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 text-xs cursor-pointer" onClick={() => toggleFilter(c, selectedCoaches, setSelectedCoaches)}>
                    <UserCog className="w-2.5 h-2.5" />{c.name}<X className="w-2.5 h-2.5" />
                  </Badge>
                ))}
              </div>
            )}

            <CommandList>
              {loading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading && (query.length >= 2 || totalFilters > 0) && results.length === 0 && (
                <CommandEmpty>Aucun résultat trouvé</CommandEmpty>
              )}

              {!loading && query.length < 2 && totalFilters === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Tapez au moins 2 caractères ou utilisez les filtres
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
                            <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
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
