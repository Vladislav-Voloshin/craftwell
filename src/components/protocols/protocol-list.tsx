"use client";

import { useState, useCallback } from "react";
import {
  Heart,
  Search,
  X,
  Moon,
  Brain,
  Dumbbell,
  Apple,
  Zap,
  Snowflake,
  Sun,
  Target,
  Smile,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { FavoriteButton } from "./favorite-button";
import type { Protocol, ProtocolCategoryRecord as ProtocolCategory } from "@/lib/types/database";
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

function DifficultyDots({ difficulty }: { difficulty: string }) {
  const level = difficulty.toLowerCase().includes("easy")
    ? 1
    : difficulty.toLowerCase().includes("moderate") || difficulty.toLowerCase().includes("medium")
      ? 2
      : 3;
  return (
    <div className="flex gap-0.5 items-center" title={difficulty}>
      {[1, 2, 3].map((dot) => (
        <div
          key={dot}
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dot <= level ? "bg-foreground/60" : "bg-foreground/15"
          )}
        />
      ))}
    </div>
  );
}

export function ProtocolList({
  categories,
  protocols,
  favoriteIds = [],
  isLoggedIn = false,
  recommendedProtocols = [],
}: {
  categories: ProtocolCategory[];
  protocols: Protocol[];
  favoriteIds?: string[];
  isLoggedIn?: boolean;
  recommendedProtocols?: Protocol[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFavoriteIds, setClientFavoriteIds] = useState<Set<string>>(
    () => new Set(favoriteIds)
  );

  const onFavoriteChange = useCallback((protocolId: string, favorited: boolean) => {
    setClientFavoriteIds((prev) => {
      const next = new Set(prev);
      if (favorited) next.add(protocolId);
      else next.delete(protocolId);
      return next;
    });
  }, []);

  const filtered = protocols.filter((p) => {
    if (showFavorites && !clientFavoriteIds.has(p.id)) return false;
    if (selectedCategory && p.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Recommended for You strip */}
      {recommendedProtocols.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Recommended for You</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
            {recommendedProtocols.map((protocol) => {
              const meta = categoryMeta[protocol.category] || defaultMeta;
              const Icon = meta.icon;
              return (
                <Link
                  key={protocol.id}
                  href={`/protocols/${protocol.slug}`}
                  className="shrink-0 w-52"
                >
                  <Card className="shadow-sm dark:shadow-none hover:border-foreground/20 transition-all cursor-pointer group overflow-hidden h-full">
                    <div className="flex">
                      <div className={cn("w-1 shrink-0 rounded-l", meta.bg.replace("/10", "/40"))} />
                      <div className="flex-1 min-w-0 p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", meta.bg)}>
                            <Icon className={cn("w-3 h-3", meta.accent)} />
                          </div>
                          <span className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                            {protocol.title}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {protocol.description}
                        </p>
                        {protocol.time_commitment && (
                          <span className="text-xs text-muted-foreground/70">
                            {protocol.time_commitment}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search protocols..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[44px]"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category filter — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        <button
          onClick={() => { setSelectedCategory(null); setShowFavorites(false); }}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors min-h-[36px]",
            !selectedCategory && !showFavorites
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border hover:border-foreground/30"
          )}
        >
          All
        </button>
        {isLoggedIn && (
          <button
            onClick={() => { setShowFavorites(!showFavorites); setSelectedCategory(null); }}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors flex items-center gap-1 min-h-[36px]",
              showFavorites
                ? "bg-rose-500 text-white border-rose-500"
                : "border-border hover:border-foreground/30"
            )}
          >
            <Heart className={cn("w-3.5 h-3.5", showFavorites ? "fill-current" : "")} />
            Favorites
          </button>
        )}
        {categories.map((cat) => {
          const meta = categoryMeta[cat.slug] || defaultMeta;
          const Icon = meta.icon;
          return (
            <button
              key={cat.slug}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === cat.slug ? null : cat.slug
                )
              }
              className={cn(
                "px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition-colors flex items-center gap-1.5 min-h-[36px]",
                selectedCategory === cat.slug
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-foreground/30"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Protocol cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {searchQuery || selectedCategory ? (
            <>
              <p>No protocols match your search.</p>
              <p className="text-sm mt-1">
                Try a different keyword or category.
              </p>
            </>
          ) : (
            <>
              <p>No protocols available yet.</p>
              <p className="text-sm mt-1">
                Data ingestion is in progress — check back soon.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((protocol) => {
            const meta = categoryMeta[protocol.category] || defaultMeta;
            const Icon = meta.icon;
            return (
              <Link
                key={protocol.id}
                href={`/protocols/${protocol.slug}`}
              >
                <Card className="shadow-sm dark:shadow-none hover:border-foreground/20 transition-all cursor-pointer group overflow-hidden h-full">
                  <div className="flex">
                    {/* Category accent bar */}
                    <div className={cn("w-1 shrink-0 rounded-l", meta.bg.replace("/10", "/40"))} />
                    <div className="flex-1 min-w-0">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn("w-6 h-6 rounded-md flex items-center justify-center shrink-0", meta.bg)}>
                              <Icon className={cn("w-3.5 h-3.5", meta.accent)} />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                                {protocol.title}
                              </CardTitle>
                              <div className="flex items-center gap-2 mt-0.5">
                                <DifficultyDots difficulty={protocol.difficulty} />
                                {protocol.time_commitment && (
                                  <span className="text-xs text-muted-foreground">
                                    {protocol.time_commitment}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <FavoriteButton
                            protocolId={protocol.id}
                            initialFavorited={clientFavoriteIds.has(protocol.id)}
                            isLoggedIn={isLoggedIn}
                            onToggle={onFavoriteChange}
                          />
                        </div>
                        <CardDescription className="text-xs line-clamp-2 mt-1">
                          {protocol.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {protocol.tags?.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
