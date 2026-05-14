import { type ReactNode } from "react";
import { Loader2, AlertCircle, Inbox } from "lucide-react";

type QueryLike = {
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  error?: unknown;
  data?: unknown;
};

interface Props {
  query: QueryLike;
  children: ReactNode;
  isEmpty?: (data: unknown) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  loadingLabel?: string;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong. Please try again.";
}

export function QueryStateBoundary({
  query,
  children,
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  loadingLabel = "Loading…",
}: Props) {
  const loading = query.isLoading ?? query.isPending ?? false;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">{loadingLabel}</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2 px-6">
        <AlertCircle className="w-6 h-6 text-destructive" />
        <p className="text-sm font-medium">We couldn't load that.</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {getErrorMessage(query.error)}
        </p>
      </div>
    );
  }

  if (isEmpty && isEmpty(query.data)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2 px-6">
        <Inbox className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyDescription && (
          <p className="text-xs text-muted-foreground max-w-sm">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
