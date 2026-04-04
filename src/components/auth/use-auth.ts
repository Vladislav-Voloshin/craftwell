"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signInSchema, signUpSchema } from "@/lib/schemas";

// Read and clear ?error= from the URL on first render (set by OAuth callback)
function consumeOAuthError(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get("error");
  if (errorParam) {
    window.history.replaceState({}, "", "/auth");
    return decodeURIComponent(errorParam);
  }
  return "";
}

export function useAuth() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(false);
  const [message, setMessage] = useState(consumeOAuthError);
  const [authMode, setAuthMode] = useState<"email" | "phone">("email");
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [otpSent, setOtpSent] = useState(false);

  const supabase = createClient();

  async function handleEmailSignUp() {
    // Client-side validation (PB-222) — same schema as server
    const result = signUpSchema.safeParse({ email, password });
    if (!result.success) {
      setMessage(result.error.issues[0].message);
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signUp({
      email: result.data.email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setMessage(error ? error.message : "Check your email for a confirmation link.");
    setLoading(false);
  }

  async function handleEmailSignIn() {
    // Client-side validation (PB-218) — catches malformed emails before API call
    const result = signInSchema.safeParse({ email, password });
    if (!result.success) {
      setMessage(result.error.issues[0].message);
      return;
    }
    setLoading(true);
    setMessage("");
    const { error, data } = await supabase.auth.signInWithPassword({ email: result.data.email, password });
    if (error) {
      setMessage(error.message);
    } else if (data.user) {
      const { data: profile } = await supabase
        .from("users")
        .select("onboarding_completed")
        .eq("id", data.user.id)
        .maybeSingle();
      window.location.href = profile?.onboarding_completed ? "/protocols" : "/onboarding";
    }
    setLoading(false);
  }

  async function handlePhoneOtp() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      setMessage(error.message);
    } else {
      setOtpSent(true);
      setMessage("We sent a 6-digit code to your phone.");
    }
    setLoading(false);
  }

  async function handleVerifyOtp() {
    setLoading(true);
    setMessage("");
    const { error, data } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
    if (error) {
      setMessage(error.message);
    } else if (data.user) {
      const { data: profile } = await supabase
        .from("users")
        .select("onboarding_completed")
        .eq("id", data.user.id)
        .maybeSingle();
      window.location.href = profile?.onboarding_completed ? "/protocols" : "/onboarding";
    }
    setLoading(false);
  }

  async function handleSocialLogin(provider: "google" | "apple") {
    setSocialLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) {
      setMessage(error.message);
      setSocialLoading(false);
    }
    // On success the browser navigates away, so no need to reset loading
  }

  function switchAuthMode(mode: "email" | "phone") {
    setAuthMode(mode);
    if (mode === "email") setOtpSent(false);
    setMessage("");
  }

  function switchTab(newTab: "signin" | "signup") {
    setTab(newTab);
    setMessage("");
  }

  function resetOtp() {
    setOtpSent(false);
    setOtp("");
    setMessage("");
  }

  return {
    email, setEmail, phone, setPhone, otp, setOtp, password, setPassword,
    loading, socialLoading, message, authMode, otpSent, tab,
    handleEmailSignUp, handleEmailSignIn, handlePhoneOtp, handleVerifyOtp,
    handleSocialLogin, switchAuthMode, switchTab, resetOtp,
  };
}
