"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Trophy, Calendar } from "lucide-react";
import Link from "next/link";

interface ProtocolStreak {
  protocol_id: string;
  title: string;
  slug: string;
  current_streak: number;
  longest_streak: number;
  total_days: number;
}

interface StreakData {
  protocols: ProtocolStreak[];
  best_current: number;
  best_longest: number;
}

export function StreakSummary() {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tz = new Date().getTimezoneOffset();
    fetch(`/api/protocols/streaks?tz_offset=${tz}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (!data || data.protocols.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 px-4 text-center">
          <Flame className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No streaks yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Activate a protocol and complete tools daily to build streaks
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeStreaks = data.protocols.filter((p) => p.current_streak > 0);

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 px-4 flex flex-col items-center text-center">
            <Flame className="w-5 h-5 text-orange-500 mb-1" />
            <p className="text-2xl font-bold">{data.best_current}</p>
            <p className="text-xs text-muted-foreground">Current Best</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex flex-col items-center text-center">
            <Trophy className="w-5 h-5 text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{data.best_longest}</p>
            <p className="text-xs text-muted-foreground">Longest Ever</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex flex-col items-center text-center">
            <Calendar className="w-5 h-5 text-blue-500 mb-1" />
            <p className="text-2xl font-bold">
              {data.protocols.reduce((sum, p) => sum + p.total_days, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total Days</p>
          </CardContent>
        </Card>
      </div>

      {/* Active streaks */}
      {activeStreaks.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Active Streaks</p>
            <div className="space-y-1">
              {activeStreaks
                .sort((a, b) => b.current_streak - a.current_streak)
                .map((p) => (
                  <Link
                    key={p.protocol_id}
                    href={`/protocols/${p.slug}`}
                    className="flex items-center justify-between text-sm hover:bg-muted/50 rounded-md px-2 py-2 -mx-2 transition-colors min-h-[44px]"
                  >
                    <span className="truncate">{p.title}</span>
                    <span className="flex items-center gap-1 text-orange-500 font-medium shrink-0">
                      <Flame className="w-3.5 h-3.5" />
                      {p.current_streak}d
                    </span>
                  </Link>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
