import { Apple } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * App Store download CTA — intentionally a non-interactive "coming soon"
 * placeholder. Craftwell is not yet published on the App Store, so this does
 * not link anywhere. Once the app is live, wrap it in a
 * `<Link href={APP_STORE_URL}>` and drop the "Coming soon" badge.
 */
export function AppStoreButton({ className }: { className?: string }) {
  return (
    <div
      title="Launching soon on iOS"
      className={cn(
        "inline-flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 select-none",
        className
      )}
    >
      <Apple className="size-7 shrink-0" aria-hidden="true" />
      <span className="flex flex-col leading-tight text-left">
        <span className="text-[11px] text-muted-foreground">Download on the</span>
        <span className="text-base font-medium">App Store</span>
      </span>
      <Badge variant="secondary" className="ml-1">
        Coming soon
      </Badge>
    </div>
  );
}
