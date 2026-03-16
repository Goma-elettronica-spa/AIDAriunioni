import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Notification {
  id: string;
  tenant_id: string | null;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_by: string | null;
  created_at: string;
}

interface NotificationBellProps {
  userId: string;
  tenantId: string | null;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "ora";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min fa`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore fa`;
  if (seconds < 172800) return "ieri";
  return `${Math.floor(seconds / 86400)} giorni fa`;
}

export function NotificationBell({ userId, tenantId }: NotificationBellProps) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await (supabase.from as any)("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) {
      setNotifications(data as Notification[]);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await (supabase.from as any)("notifications")
      .update({ is_read: true })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    await (supabase.from as any)("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.link) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  const displayedNotifications = notifications.slice(0, 10);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-medium leading-none">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground">Notifiche</h4>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Segna tutte come lette
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto">
          {displayedNotifications.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Nessuna notifica</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayedNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? "bg-blue-50/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        !notification.is_read ? "bg-blue-500" : "bg-gray-300"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm truncate ${
                          !notification.is_read
                            ? "font-semibold text-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {notification.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            {unreadCount} non lette
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
