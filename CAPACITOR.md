# Craftwell iOS (Capacitor)

The native iOS shell loads the hosted web app (`https://craftwell.vercel.app`) and
adds native capability. The `ios/` Xcode project is generated on a Mac (it needs
Xcode), so it is not committed here — generate it once, then commit it.

## One-time setup (on your Mac)
Prereqs: Xcode + Command Line Tools, CocoaPods (`brew install cocoapods`), Apple
Developer account (done).

```bash
npm install
npx cap add ios          # generates the ios/ Xcode project
npx cap sync ios         # copies config + plugins into it
npx cap open ios         # opens Xcode
```
In Xcode → target **App** → Signing & Capabilities: set **Bundle ID = com.craftwell.app**
and your **Team**. Run on a simulator/device to confirm the app loads.

## Day-to-day
- After changing `capacitor.config.ts` or plugins: `npx cap sync ios`.
- The web app updates automatically (it's loaded from Vercel) — no rebuild needed
  for web-only changes.

## Required before App Store submission (or Apple will reject)
1. **Sign in with Apple** (Guideline 4.8) — mandatory because we offer Google login.
   Add the capability in Xcode + wire Supabase Apple OAuth. *(code task — next)*
2. **In-App Purchase via RevenueCat** (Guideline 3.1.1) — iOS Premium cannot use
   Stripe. Entitlements already unify via `subscriptions.provider` → wire RevenueCat
   to write `provider='apple'` rows. *(code task)*
3. **Native value** so it's not a "web wrapper" (Guideline 4.2): push notifications,
   haptics. Add `@capacitor/push-notifications`.
4. **Privacy manifest** (`PrivacyInfo.xcprivacy`), App Privacy nutrition labels,
   **demo account** for reviewers (the app is auth-gated), screenshots (ASO copy
   already drafted in Notion).
5. **TestFlight** internal → external beta, then submit.

## Notes
- Bundle ID `com.craftwell.app` — change in `capacitor.config.ts` if you register a
  different one in App Store Connect.
- 4.2 risk: a near-pure remote load can be rejected. The mitigation is the native
  features in (1)–(3). If review pushes back, the fallback is re-architecting the
  client to a static shell + API backend (larger effort).
