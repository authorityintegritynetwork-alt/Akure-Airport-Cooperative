import {
  useGetProfile,
  useGetMemberBalanceTimeline,
  getGetMemberBalanceTimelineQueryKey,
} from "@workspace/api-client-react";
import { BalanceTimeline } from "@/components/balance-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Printer } from "lucide-react";

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
      <div className="flex items-start justify-between gap-3">
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
        {timeline && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5 shrink-0 print:hidden"
            onClick={() => window.print()}
            data-testid="button-print-statement"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
            <span className="sm:hidden">Print</span>
          </Button>
        )}
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
