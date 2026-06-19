import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://craftwell.vercel.app"),
  title: {
    default: "Craftwell — Science-Based Health Protocols",
    template: "Craftwell — %s",
  },
  description:
    "Evidence-based health protocols ranked by effectiveness. Build your optimal routine with science-backed tools for sleep, focus, exercise, and more.",
  keywords: [
    "health protocols",
    "science-based wellness",
    "sleep optimization",
    "focus improvement",
    "exercise routines",
    "evidence-based health",
    "biohacking",
  ],
  authors: [{ name: "Craftwell" }],
  openGraph: {
    title: "Craftwell — Science-Based Health Protocols",
    description:
      "Evidence-based health protocols ranked by effectiveness. Build your optimal routine with science-backed tools for sleep, focus, exercise, and more.",
    url: "https://craftwell.vercel.app",
    siteName: "Craftwell",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Craftwell — Science-Based Health Protocols",
    description:
      "Evidence-based health protocols ranked by effectiveness. Build your optimal routine with science-backed tools for sleep, focus, exercise, and more.",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Craftwell",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <RegisterServiceWorker />
        </ThemeProvider>
      </body>
    </html>
  );
}
