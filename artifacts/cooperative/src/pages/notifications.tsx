import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { Bell, BellRing, CheckCheck } from "lucide-react";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useListNotifications({});
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function handleMarkRead(id: number) {
    markRead.mutate(
      { id },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: getListNotificationsQueryKey({}),
          }),
      },
    );
  }

  function handleMarkAll() {
    markAllRead.mutate(undefined, {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListNotificationsQueryKey({}),
        }),
    });
  }

  const unreadCount =
    notifications?.filter((n: any) => !n.isRead).length || 0;
  const hasNotifications = (notifications?.length ?? 0) > 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-primary-foreground flex items-center justify-center shadow-md shadow-primary/25">
              {unreadCount > 0 ? (
                <BellRing className="w-5 h-5" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
            </div>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold leading-tight">
              Notifications
            </h1>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
                : "You're all caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5 shrink-0"
            onClick={handleMarkAll}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Mark all read</span>
            <span className="sm:hidden">Read all</span>
          </Button>
        )}
      </div>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="pb-3 sr-only">
          <CardTitle>All notifications</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !hasNotifications ? (
            <div className="text-center py-12">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                You'll see updates about your loans, savings, and store activity
                here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...notifications!].reverse().map((n: any) => (
                <div
                  key={n.id}
                  className={`relative rounded-xl p-3.5 border transition-colors ${
                    n.isRead
                      ? "bg-card border-border/50"
                      : "bg-gradient-to-br from-primary/5 to-primary/0 border-primary/20"
                  }`}
                  data-testid={`notification-row-${n.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        n.isRead
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-snug ${
                            !n.isRead ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="shrink-0 mt-1 w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      {n.message && (
                        <p
                          className={`text-xs mt-1 leading-snug ${
                            n.isRead
                              ? "text-muted-foreground"
                              : "text-foreground/80"
                          }`}
                        >
                          {n.message}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(n.createdAt)}
                        </p>
                        {!n.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleMarkRead(n.id)}
                            data-testid={`button-mark-read-${n.id}`}
                          >
                            Mark read
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
