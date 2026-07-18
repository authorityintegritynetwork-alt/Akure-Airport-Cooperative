import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListMembers,
  useGetMemberBalanceTimeline,
  getGetMemberBalanceTimelineQueryKey,
  type Member,
} from "@workspace/api-client-react";
import { BalanceTimeline } from "@/components/balance-timeline";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, X, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "active") return "default";
  if (status === "pending") return "secondary";
  return "outline";
}

export function StatementsPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce the search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-load member from URL ?memberId=N on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("memberId");
    if (id && !isNaN(parseInt(id, 10))) {
      setSelectedId(parseInt(id, 10));
    }
  }, []);

  // Member search results
  const { data: searchResults } = useListMembers(
    { search: debouncedQuery },
    {
      query: {
        enabled: debouncedQuery.length >= 2,
        queryKey: ["members-search", debouncedQuery],
      },
    },
  );

  // Timeline for the selected member
  const { data: timeline, isLoading: timelineLoading } =
    useGetMemberBalanceTimeline(selectedId ?? 0, {
      query: {
        enabled: selectedId !== null,
        queryKey: getGetMemberBalanceTimelineQueryKey(selectedId ?? 0),
      },
    });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !dropdownRef.current?.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // When timeline loads for a URL-param member, fill the search box name
  useEffect(() => {
    if (timeline && !query) {
      setQuery(timeline.fullName);
    }
  }, [timeline]);

  const selectMember = (member: Member) => {
    setSelectedId(member.id);
    setQuery(member.fullName);
    setShowDropdown(false);
    setLocation(`/statements?memberId=${member.id}`);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setQuery("");
    setDebouncedQuery("");
    setLocation("/statements");
    inputRef.current?.focus();
  };

  const members = searchResults ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 print:px-0 print:py-0">
      {/* Page header */}
      <div className="mb-5 print:hidden">
        <h1 className="text-xl font-bold tracking-tight">Account Statements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search any member (active or pending) to view their month-by-month
          balance history.
        </p>
      </div>

      {/* Search box */}
      <div className="relative mb-6 print:hidden">
        <div className="relative flex items-center">
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
              if (!e.target.value) {
                setSelectedId(null);
                setLocation("/statements");
              }
            }}
            onFocus={() => {
              if (query.length >= 2) setShowDropdown(true);
            }}
            placeholder="Search by name or employee number…"
            className="pl-9 pr-9 rounded-xl"
          />
          {query && (
            <button
              className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
              onClick={clearSelection}
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown results */}
        {showDropdown && members.length > 0 && !selectedId && (
          <div
            ref={dropdownRef}
            className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg overflow-hidden"
          >
            {members.slice(0, 8).map((m) => (
              <button
                key={m.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
                onMouseDown={() => selectMember(m)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.organization}
                    {m.staffId ? ` · ${m.staffId}` : ""}
                  </p>
                </div>
                <Badge
                  variant={statusVariant(m.status)}
                  className="text-[10px] shrink-0"
                >
                  {m.status}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty / loading states */}
      {!selectedId && (
        <div className="text-center text-muted-foreground text-sm py-20 print:hidden">
          Search for a member above to view their balance statement.
        </div>
      )}

      {selectedId && timelineLoading && (
        <div className="text-center text-muted-foreground text-sm py-20 print:hidden">
          Loading statement…
        </div>
      )}

      {/* Timeline */}
      {timeline && (
        <Card className="rounded-2xl shadow-sm border-border/70 print:border-0 print:shadow-none print:rounded-none">
          <CardHeader className="pb-2 print:hidden">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Balance Timeline
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From opening balance through each uploaded month to the current
                  balance.
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{timeline.fullName}</p>
                <Badge
                  variant={statusVariant(timeline.memberStatus)}
                  className="text-[10px] mt-0.5"
                >
                  {timeline.memberStatus}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <BalanceTimeline timeline={timeline} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
