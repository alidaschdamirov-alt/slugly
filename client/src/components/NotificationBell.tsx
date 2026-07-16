import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, CheckCheck, Info, Megaphone, AlertTriangle, Sparkles } from "lucide-react";
import { useState } from "react";
function formatDistanceToNow(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const categoryIcons: Record<string, typeof Info> = {
  system: Info,
  update: Sparkles,
  promo: Megaphone,
  alert: AlertTriangle,
};

const categoryColors: Record<string, string> = {
  system: "text-blue-500",
  update: "text-emerald-500",
  promo: "text-purple-500",
  alert: "text-amber-500",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: unreadCount } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30000, // Poll every 30s
  });

  const { data: notifications, isLoading } = trpc.notification.list.useQuery(undefined, {
    enabled: open,
  });

  const markRead = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const count = unreadCount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = categoryIcons[n.category] || Info;
                const color = categoryColors[n.category] || "text-muted-foreground";
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 transition-colors ${
                      !n.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className={`mt-0.5 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-tight ${!n.read ? "font-semibold" : "font-medium"}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0"
                            onClick={() => markRead.mutate({ recipientId: n.id })}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
