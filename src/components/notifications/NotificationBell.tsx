import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Target, Check, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!user,
    refetchInterval: 30000, // poll every 30s as fallback
  });

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead(notif.id);
    if (notif.link) {
      setOpen(false);
      navigate(notif.link);
    }
  };

  // Mapping type -> styles sémantiques (Étape 11)
  const getTypeStyles = (type: string) => {
    switch (type) {
      case "success":
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-success" />,
          unreadBg: "bg-[#F0FDF4] border-l-2 border-success/40",
          dot: "bg-success",
        };
      case "error":
      case "destructive":
        return {
          icon: <AlertCircle className="w-4 h-4 text-destructive" />,
          unreadBg: "bg-[#FEF2F2] border-l-2 border-destructive/40",
          dot: "bg-destructive",
        };
      case "warning":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-accent" />,
          unreadBg: "bg-[#FFFBEB] border-l-2 border-accent/40",
          dot: "bg-accent",
        };
      case "objective":
        return {
          icon: <Target className="w-4 h-4 text-primary" />,
          unreadBg: "bg-[#EFF6FF] border-l-2 border-primary/40",
          dot: "bg-primary",
        };
      case "info":
      default:
        return {
          icon: <Info className="w-4 h-4 text-primary" />,
          unreadBg: "bg-[#EFF6FF] border-l-2 border-primary/40",
          dot: "bg-primary",
        };
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={markAllAsRead}>
              <Check className="w-3 h-3" />
              Tout marquer lu
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Aucune notification
            </div>
          ) : (
            <div>
              {notifications.map((notif) => {
                const styles = getTypeStyles(notif.type);
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex gap-3 ${
                      !notif.is_read ? styles.unreadBg : ""
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">{styles.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.is_read ? "font-semibold" : ""}`}>{notif.title}</p>
                      {notif.message && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${styles.dot}`} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
