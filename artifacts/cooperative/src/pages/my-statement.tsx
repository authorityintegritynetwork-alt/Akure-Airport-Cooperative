import {
  useGetProfile,
  useGetMemberBalanceTimeline,
  getGetMemberBalanceTimelineQueryKey,
} from "@workspace/api-client-react";
import { BalanceTimeline } from "@/components/balance-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";

export function MyStatementPage() {
  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const memberId = profile?.id;

  const { data: timeline, isLoading: timelineLoading } = useGetMemberBalanceTimeline(
    memberId ?? 0,
    {
      query: {
        enabled: !!memberId,
        queryKey: getGetMemberBalanceTimelineQueryKey(memberId ?? 0),
      },
    },
  );

  const isLoading = profileLoading || (!!memberId && timelineLoading);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">My Statement</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Your per-product balance breakdown — savings accounts, loan repayments, and
          monthly deductions.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      ) : !timeline ? (
        <div className="border border-border rounded-xl py-12 text-center text-sm text-muted-foreground">
          No balance data on record yet.
        </div>
      ) : (
        <BalanceTimeline timeline={timeline} />
      )}
    </div>
  );
}
