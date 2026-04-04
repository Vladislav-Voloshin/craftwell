"use client";

import { useMemo } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-en";
import { Button } from "@/components/ui/button";

// Initialise zxcvbn-ts with English dictionary (runs once at module load)
zxcvbnOptions.setOptions({
  translations: zxcvbnCommonPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
  },
});

/** NIST 800-63b: minimum 8 characters, minimum zxcvbn score 2 */
const MIN_LENGTH = 8;
const MIN_SCORE = 2;

interface EmailAuthFormProps {
  email: string;
  password: string;
  loading: boolean;
  mode: "signin" | "signup";
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}

function FloatingInput({
  id,
  type,
  label,
  value,
  onChange,
}: {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className="peer w-full rounded-lg border border-input bg-transparent px-3 pt-5 pb-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm peer-focus:top-2.5 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:text-xs"
      >
        {label}
      </label>
    </div>
  );
}

const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
const STRENGTH_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-emerald-500",
  "bg-emerald-600",
];
const STRENGTH_TEXT_COLORS = [
  "text-red-600 dark:text-red-400",
  "text-orange-600 dark:text-orange-400",
  "text-yellow-600 dark:text-yellow-500",
  "text-emerald-600 dark:text-emerald-400",
  "text-emerald-700 dark:text-emerald-300",
];

function PasswordStrengthMeter({ password }: { password: string }) {
  const result = useMemo(
    () => (password ? zxcvbn(password) : null),
    [password]
  );

  if (!password) return null;

  const score = result?.score ?? 0;
  const meetsLength = password.length >= MIN_LENGTH;
  const meetsScore = score >= MIN_SCORE;
  const isValid = meetsLength && meetsScore;

  return (
    <div className="space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i <= score ? STRENGTH_COLORS[score] : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Score label + feedback */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${STRENGTH_TEXT_COLORS[score]}`}>
          {STRENGTH_LABELS[score]}
        </span>
        {isValid && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Strong enough
          </span>
        )}
      </div>

      {/* Inline requirement hints */}
      <ul className="space-y-1 pl-0.5">
        <li className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
              meetsLength ? "bg-emerald-500" : "bg-muted-foreground/30"
            }`}
          />
          <span className={meetsLength ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
            At least {MIN_LENGTH} characters
          </span>
        </li>
        <li className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
              meetsScore ? "bg-emerald-500" : "bg-muted-foreground/30"
            }`}
          />
          <span className={meetsScore ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
            Not too easy to guess
          </span>
        </li>
        {result?.feedback?.warning && (
          <li className="text-xs text-orange-600 dark:text-orange-400">
            {result.feedback.warning}
          </li>
        )}
      </ul>
    </div>
  );
}

export function EmailAuthForm({
  email,
  password,
  loading,
  mode,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: EmailAuthFormProps) {
  const result = useMemo(
    () => (mode === "signup" && password ? zxcvbn(password) : null),
    [mode, password]
  );

  const isSignupDisabled =
    mode === "signup" &&
    password.length > 0 &&
    (password.length < MIN_LENGTH || (result?.score ?? 0) < MIN_SCORE);

  return (
    <div className="space-y-4">
      <FloatingInput
        id="email"
        type="email"
        label="Email"
        value={email}
        onChange={onEmailChange}
      />
      <div className="space-y-2">
        <FloatingInput
          id="password"
          type="password"
          label="Password"
          value={password}
          onChange={onPasswordChange}
        />
        {mode === "signup" && <PasswordStrengthMeter password={password} />}
      </div>
      <Button
        className="w-full"
        onClick={onSubmit}
        disabled={loading || isSignupDisabled}
      >
        {loading
          ? mode === "signup" ? "Creating account..." : "Signing in..."
          : mode === "signup" ? "Create Account" : "Sign In"}
      </Button>
    </div>
  );
}
