"use client";

import { useState, useCallback } from "react";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PhoneAuthFormProps {
  phone: string;
  otp: string;
  otpSent: boolean;
  loading: boolean;
  onPhoneChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onSendOtp: (normalizedPhone: string) => void;
  onVerifyOtp: () => void;
  onReset: () => void;
}

/** Parse and validate the input, returning E.164 format or null on invalid. */
function parseE164(raw: string): string | null {
  // Try parsing with a leading "+" if not already present (helps UX)
  const attempt = raw.startsWith("+") ? raw : `+${raw}`;
  const parsed = parsePhoneNumberFromString(attempt);
  if (parsed?.isValid()) return parsed.number; // E.164

  // Try again without the injected "+", using a default country as fallback
  const withoutPlus = parsePhoneNumberFromString(raw, "US" as CountryCode);
  if (withoutPlus?.isValid()) return withoutPlus.number;

  return null;
}

export function PhoneAuthForm({
  phone,
  otp,
  otpSent,
  loading,
  onPhoneChange,
  onOtpChange,
  onSendOtp,
  onVerifyOtp,
  onReset,
}: PhoneAuthFormProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(() => {
    setError(null);
    if (!phone.trim()) {
      setError("Please enter a phone number.");
      return;
    }
    const e164 = parseE164(phone.trim());
    if (!e164) {
      setError("Enter a valid phone number with country code (e.g. +1 555 123 4567).");
      return;
    }
    // Pass the normalised E.164 number to the parent so Supabase receives it
    onSendOtp(e164);
  }, [phone, onSendOtp]);

  const handlePhoneChange = useCallback(
    (value: string) => {
      setError(null);
      onPhoneChange(value);
    },
    [onPhoneChange]
  );

  if (!otpSent) {
    return (
      <div className="space-y-3">
        <Input
          type="tel"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "phone-error" : undefined}
        />
        {error && (
          <p id="phone-error" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button
          className="w-full"
          onClick={handleSend}
          disabled={loading || !phone.trim()}
        >
          {loading ? "Sending code..." : "Send Verification Code"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-center">
        Enter the 6-digit code sent to {phone}
      </p>
      <Input
        type="text"
        inputMode="numeric"
        placeholder="000000"
        maxLength={6}
        value={otp}
        onChange={(e) => onOtpChange(e.target.value.replace(/\D/g, ""))}
        className="text-center text-lg tracking-widest"
      />
      <Button
        className="w-full"
        onClick={onVerifyOtp}
        disabled={loading || otp.length !== 6}
      >
        {loading ? "Verifying..." : "Verify Code"}
      </Button>
      <button
        onClick={onReset}
        className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
      >
        Use a different number
      </button>
    </div>
  );
}
