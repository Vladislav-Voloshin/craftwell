"use client";

import { Button } from "@/components/ui/button";

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

function PasswordHints({ password }: { password: string }) {
  const checks = [
    { label: "At least 6 characters", met: password.length >= 6 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains a letter", met: /[a-zA-Z]/.test(password) },
  ];

  return (
    <ul className="space-y-1 pl-0.5">
      {checks.map(({ label, met }) => (
        <li key={label} className="flex items-center gap-1.5 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
              met ? "bg-emerald-500" : "bg-muted-foreground/30"
            }`}
          />
          <span className={met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
            {label}
          </span>
        </li>
      ))}
    </ul>
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
        {mode === "signup" && <PasswordHints password={password} />}
      </div>
      <Button className="w-full" onClick={onSubmit} disabled={loading}>
        {loading
          ? mode === "signup" ? "Creating account..." : "Signing in..."
          : mode === "signup" ? "Create Account" : "Sign In"}
      </Button>
    </div>
  );
}
