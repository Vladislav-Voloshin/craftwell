import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Moon,
  Brain,
  Dumbbell,
  Heart,
  Apple,
  Zap,
  Snowflake,
  Sun,
  Target,
  Smile,
  ClipboardList,
} from "lucide-react";
import type { Protocol } from "@/lib/types/database";
import type { LucideIcon } from "lucide-react";

const categoryMeta: Record<string, { icon: LucideIcon; accent: string; bg: string }> = {
  sleep: { icon: Moon, accent: "text-indigo-500", bg: "bg-indigo-500/10" },
  focus: { icon: Brain, accent: "text-amber-500", bg: "bg-amber-500/10" },
  exercise: { icon: Dumbbell, accent: "text-emerald-500", bg: "bg-emerald-500/10" },
  stress: { icon: Heart, accent: "text-rose-500", bg: "bg-rose-500/10" },
  nutrition: { icon: Apple, accent: "text-green-500", bg: "bg-green-500/10" },
  hormones: { icon: Zap, accent: "text-yellow-500", bg: "bg-yellow-500/10" },
  "cold-heat": { icon: Snowflake, accent: "text-cyan-500", bg: "bg-cyan-500/10" },
  light: { icon: Sun, accent: "text-orange-500", bg: "bg-orange-500/10" },
  motivation: { icon: Target, accent: "text-purple-500", bg: "bg-purple-500/10" },
  "mental-health": { icon: Smile, accent: "text-pink-500", bg: "bg-pink-500/10" },
};

const defaultMeta = { icon: ClipboardList, accent: "text-muted-foreground", bg: "bg-muted" };

export function RelatedProtocols({ protocols }: { protocols: Protocol[] }) {
  if (protocols.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Related Protocols</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {protocols.map((protocol) => {
          const meta = categoryMeta[protocol.category] || defaultMeta;
          const Icon = meta.icon;
          return (
            <Link key={protocol.id} href={`/protocols/${protocol.slug}`}>
              <Card className="h-full shadow-sm dark:shadow-none hover:border-border transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className={cn("w-6 h-6 flex items-center justify-center rounded-md shrink-0", meta.bg)}>
                      <Icon className={cn("w-3.5 h-3.5", meta.accent)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={protocol.title}>{protocol.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {protocol.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {protocol.difficulty}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {protocol.time_commitment}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
