# App Store Submission Pack — Craftwell

Everything needed at submission time that isn't code. Derived from the current
data model and auth setup. Pair with `CAPACITOR.md` (build steps).

## 1. App Privacy ("nutrition label" — App Store Connect → App Privacy)

**Tracking (used to track across apps/websites for ads): NO.** There are no ad
or attribution SDKs. Do **not** check any "used for tracking" box.

Data collected, all **linked to the user's identity** (account-based), used only
for **App Functionality** (+ Sentry = Analytics/Diagnostics):

| Apple category | Specific data | Source |
|---|---|---|
| Contact Info | Email address, Name, Phone number | Supabase auth + profile |
| Health & Fitness | Health goals, sleep quality, stress, exercise frequency, protocol completions | onboarding survey + tracking |
| User Content | Chat messages, protocol notes | chat + notes features |
| Purchases | Subscription/purchase history | Stripe / Apple IAP |
| Identifiers | User ID | Supabase |
| Usage Data + Diagnostics | Crash logs, basic usage | Sentry |

Health & Fitness data is used **only for app functionality**, never for ads or
tracking (Apple is strict on this).

## 2. Reviewer demo account (REQUIRED — app is auth-gated)
App Review can't see anything behind login, so in **App Review Information**:
- Provide a working **email + password** account (not phone OTP — reviewers
  can't receive your SMS). Seed it with a couple of active protocols + a chat so
  the core experience is visible.
- Notes to reviewer (draft):
  > Craftwell is an educational health-protocol app. Sign in with the demo
  > account (or "Sign in with Apple"). Browse Protocols → open one → mark tools
  > complete. Tap the AI adviser to ask a health question. Content is
  > educational and **not medical advice** (disclaimers in-app + in Terms).

## 3. Age rating
Likely **17+** — health/medical information topics. Be consistent with the
"not medical advice" framing; do not claim to diagnose/treat.

## 4. PrivacyInfo.xcprivacy (REQUIRED since 2024)
Add to the generated `ios/App/App/` target. Starter — adjust accessed-API reasons
to what the build actually uses:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <!-- Repeat for: Name, PhoneNumber, HealthFitness, OtherUserContent,
         Purchases, UserID, CrashData -->
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

## 5. Hard gates checklist (cross-ref CAPACITOR.md)
- [ ] **Sign in with Apple** capability enabled in Xcode + Apple Service ID in Supabase (code already merged).
- [ ] **In-App Purchase** via RevenueCat (no Stripe for iOS Premium) — products created in App Store Connect.
- [ ] Native value present (push notifications) so it's not flagged as a web wrapper (Guideline 4.2).
- [ ] `PrivacyInfo.xcprivacy` added; App Privacy form completed (§1).
- [ ] Demo account + reviewer notes filled in (§2).
- [ ] Screenshots (ASO copy already drafted in Notion).
- [ ] Privacy Policy + Terms URLs (live: `/privacy`, `/terms`).
