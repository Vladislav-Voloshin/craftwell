"use client";

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { SocialLoginButton } from "@/components/auth/social-login-button";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { useAuth } from "@/components/auth/use-auth";

const appleAuthEnabled =
  process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "true";

export default function AuthPage() {
  const auth = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3 pb-6">
          <Link href="/" className="inline-flex items-center justify-center gap-2 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-base">
              C
            </div>
          </Link>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Welcome to Craftwell</CardTitle>
            <CardDescription className="text-sm">
              Science-based health protocols, ranked by effectiveness
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <SocialLoginButton
              provider="google"
              onClick={() => auth.handleSocialLogin("google")}
              disabled={auth.socialLoading || auth.loading}
            />
            {appleAuthEnabled && (
              <SocialLoginButton
                provider="apple"
                onClick={() => auth.handleSocialLogin("apple")}
                disabled={auth.socialLoading || auth.loading}
              />
            )}
          </div>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
              or continue with
            </span>
          </div>

          {/* Unified segmented control for Sign In / Sign Up */}
          <div className="space-y-5">
            <div className="flex rounded-lg bg-muted p-1">
              <button
                onClick={() => auth.switchTab?.("signin")}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  auth.tab === "signup"
                    ? "text-muted-foreground hover:text-foreground"
                    : "bg-background text-foreground shadow-sm"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => auth.switchTab?.("signup")}
                className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                  auth.tab === "signup"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Auth mode selector — unified segmented control */}
            <div className="flex rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => auth.switchAuthMode("email")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  auth.authMode === "email"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Email
              </button>
              <button
                onClick={() => auth.switchAuthMode("phone")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  auth.authMode === "phone"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Phone
              </button>
            </div>

            {auth.authMode === "phone" ? (
              <PhoneAuthForm
                phone={auth.phone}
                otp={auth.otp}
                otpSent={auth.otpSent}
                loading={auth.loading}
                onPhoneChange={auth.setPhone}
                onOtpChange={auth.setOtp}
                onSendOtp={auth.handlePhoneOtp}
                onVerifyOtp={auth.handleVerifyOtp}
                onReset={auth.resetOtp}
              />
            ) : auth.tab === "signup" ? (
              <EmailAuthForm
                email={auth.email}
                password={auth.password}
                loading={auth.loading}
                mode="signup"
                onEmailChange={auth.setEmail}
                onPasswordChange={auth.setPassword}
                onSubmit={auth.handleEmailSignUp}
              />
            ) : (
              <>
                <EmailAuthForm
                  email={auth.email}
                  password={auth.password}
                  loading={auth.loading}
                  mode="signin"
                  onEmailChange={auth.setEmail}
                  onPasswordChange={auth.setPassword}
                  onSubmit={auth.handleEmailSignIn}
                />
                <div className="text-right">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </>
            )}
          </div>

          {auth.message && (
            <p className="text-sm text-center text-muted-foreground">{auth.message}</p>
          )}

          <p className="text-xs text-center text-muted-foreground pt-2">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
