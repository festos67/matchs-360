import { useState, useMemo } from "react";
import { Check, X, Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  team_name?: string;
}

interface PlayerSelectorProps {
  players: Player[];
  selectedPlayerIds: string[];
  onSelectionChange: (playerIds: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
}

export const PlayerSelector = ({
  players,
  selectedPlayerIds,
  onSelectionChange,
  placeholder = "Rechercher un joueur...",
  emptyMessage = "Aucun joueur trouvé",
}: PlayerSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const getPlayerName = (player: Player) => {
    if (player.nickname) return player.nickname;
    if (player.first_name && player.last_name) {
      return `${player.first_name} ${player.last_name}`;
    }
    return player.first_name || player.last_name || "Joueur";
  };

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return players;
    
    const query = searchQuery.toLowerCase();
    return players.filter((player) => {
      const firstName = player.first_name?.toLowerCase() || "";
      const lastName = player.last_name?.toLowerCase() || "";
      const nickname = player.nickname?.toLowerCase() || "";
      const teamName = player.team_name?.toLowerCase() || "";
      
      return (
        firstName.includes(query) ||
        lastName.includes(query) ||
        nickname.includes(query) ||
        teamName.includes(query)
      );
    });
  }, [players, searchQuery]);

  const selectedPlayers = useMemo(() => {
    return players.filter((p) => selectedPlayerIds.includes(p.id));
  }, [players, selectedPlayerIds]);

  const handleTogglePlayer = (
    e: React.MouseEvent | React.KeyboardEvent,
    playerId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (selectedPlayerIds.includes(playerId)) {
      onSelectionChange(selectedPlayerIds.filter((id) => id !== playerId));
    } else {
      onSelectionChange([...selectedPlayerIds, playerId]);
    }
  };

  const handleRemovePlayer = (
    e: React.MouseEvent,
    playerId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectionChange(selectedPlayerIds.filter((id) => id !== playerId));
  };

  return (
    <div className="space-y-3">
      {/* Selected players as tags */}
      {selectedPlayers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPlayers.map((player) => (
            <Badge
              key={player.id}
              variant="secondary"
              className="flex items-center gap-1 py-1.5 px-3 bg-primary/10 text-primary border-primary/20"
            >
              <span>{getPlayerName(player)}</span>
              {player.team_name && (
                <span className="text-xs text-muted-foreground">
                  ({player.team_name})
                </span>
              )}
              <button
                type="button"
                onClick={(e) => handleRemovePlayer(e, player.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                aria-label={`Retirer ${getPlayerName(player)}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Search className="w-4 h-4" />
              <span>
                {selectedPlayerIds.length > 0
                  ? `${selectedPlayerIds.length} joueur${selectedPlayerIds.length > 1 ? "s" : ""} sélectionné${selectedPlayerIds.length > 1 ? "s" : ""}`
                  : placeholder}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <div className="p-2 border-b border-border">
            <Input
              placeholder="Tapez un nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>
          <ScrollArea className="h-64">
            {filteredPlayers.length > 0 ? (
              <div className="p-1">
                {filteredPlayers.map((player) => {
                  const isSelected = selectedPlayerIds.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={(e) => handleTogglePlayer(e, player.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        )}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {getPlayerName(player)}
                        </p>
                        {player.team_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {player.team_name}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};
