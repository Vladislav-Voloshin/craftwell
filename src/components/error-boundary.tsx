"use client";

import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";

interface Props {
  /** Content to render when no error has occurred */
  children: ReactNode;
  /**
   * Custom fallback UI. Receives the caught error and a resetErrorBoundary
   * callback that clears the error state so the tree can be re-rendered.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional label surfaced in Sentry reports to identify the boundary */
  name?: string;
}

interface State {
  error: Error | null;
}

/**
 * React error boundary for catching unhandled render/lifecycle errors.
 * Captures to Sentry and shows a fallback UI rather than a blank screen.
 *
 * Usage:
 *   <ErrorBoundary name="ChatInterface">
 *     <ChatInterface ... />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      extra: {
        componentStack: info.componentStack,
        boundaryName: this.props.name,
      },
      tags: { component: this.props.name ?? "unknown-boundary" },
    });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong. Please try refreshing the page.
          </p>
          <button
            onClick={this.reset}
            className="text-xs text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
