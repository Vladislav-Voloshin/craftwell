import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Protocol } from "@/lib/types/database";
import { categoryMeta, defaultMeta } from "@/lib/protocol-category-meta";

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
                      <p className="text-sm font-medium truncate">{protocol.title}</p>
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
