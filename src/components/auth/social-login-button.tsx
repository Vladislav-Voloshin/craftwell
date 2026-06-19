"use client";

import { Button } from "@/components/ui/button";

interface SocialLoginButtonProps {
  provider: "google" | "apple";
  onClick: () => void;
  disabled?: boolean;
}

const GOOGLE_ICON = (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const APPLE_ICON = (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.84.94-2.2 1.66-3.32 1.57-.14-1.1.43-2.27 1.1-3 .76-.82 2.13-1.45 3.34-1.55zM20.9 17.1c-.55 1.27-.82 1.84-1.53 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.01-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.73-.02-3.05-1.77-4.04-3.33-2.77-4.36-3.06-9.48-1.35-12.2 1.21-1.93 3.13-3.06 4.93-3.06 1.84 0 2.99 1.01 4.51 1.01 1.47 0 2.37-1.01 4.5-1.01 1.6 0 3.3.87 4.5 2.38-3.96 2.17-3.32 7.82.23 9.74z" />
  </svg>
);

const LABELS: Record<string, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
};

export function SocialLoginButton({ provider, onClick, disabled }: SocialLoginButtonProps) {
  return (
    <Button
      variant="outline"
      className="w-full h-11 text-base font-medium"
      onClick={onClick}
      disabled={disabled}
    >
      {provider === "google" && GOOGLE_ICON}
      {provider === "apple" && APPLE_ICON}
      {LABELS[provider]}
    </Button>
  );
}
