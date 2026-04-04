"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";

type ServiceStatus = "healthy" | "degraded" | "unhealthy";

interface ServiceCheck {
  status: ServiceStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthData {
  status: ServiceStatus;
  uptime: number;
  version: string;
  checks: {
    supabase: ServiceCheck;
    pinecone: ServiceCheck;
    anthropic: ServiceCheck;
  };
  timestamp: string;
}

const REFRESH_INTERVAL_MS = 30_000;

function StatusIcon({ status }: { status: ServiceStatus }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "degraded":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />;
  }
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    healthy: "bg-green-500",
    degraded: "bg-yellow-500",
    unhealthy: "bg-red-500",
  };
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${colors[status]}`}
      aria-label={status}
    />
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

function ServiceCard({ name, check }: { name: string; check: ServiceCheck }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {name}
        </h3>
        <StatusDot status={check.status} />
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center gap-2">
          <StatusIcon status={check.status} />
          <span className="text-lg font-semibold capitalize text-neutral-900 dark:text-neutral-100">
            {check.status}
          </span>
        </div>
        {check.latencyMs !== undefined && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Latency: <span className="font-mono">{check.latencyMs}ms</span>
          </p>
        )}
        {check.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {check.error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function HealthDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok && res.status !== 503) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: HealthData = await res.json();
      setHealth(data);
      setError(null);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const statusColors: Record<ServiceStatus, string> = {
    healthy: "text-green-600 dark:text-green-400",
    degraded: "text-yellow-600 dark:text-yellow-400",
    unhealthy: "text-red-600 dark:text-red-400",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-neutral-700 dark:text-neutral-300" />
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            System Health
          </h1>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchHealth();
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">
            Failed to fetch health data: {error}
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !health && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800"
            />
          ))}
        </div>
      )}

      {health && (
        <>
          {/* Overall status banner */}
          <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusDot status={health.status} />
                <span
                  className={`text-xl font-bold capitalize ${statusColors[health.status]}`}
                >
                  System {health.status}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm text-neutral-500 dark:text-neutral-400 sm:items-end">
                <span>
                  Version: <span className="font-mono">{health.version}</span>
                </span>
                <span>Uptime: {formatUptime(health.uptime)}</span>
              </div>
            </div>
          </div>

          {/* Service cards */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <ServiceCard name="Supabase" check={health.checks.supabase} />
            <ServiceCard name="Pinecone" check={health.checks.pinecone} />
            <ServiceCard name="Anthropic" check={health.checks.anthropic} />
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-1 text-xs text-neutral-400 dark:text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Last check: {lastFetch ? lastFetch.toLocaleString() : "Never"}
            </span>
            <span>
              Server timestamp:{" "}
              {new Date(health.timestamp).toLocaleString()}
            </span>
            <span>Auto-refreshes every 30s</span>
          </div>
        </>
      )}
    </div>
  );
}
