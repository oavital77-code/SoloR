import type { Metadata, Viewport } from "next";
import { Frank_Ruhl_Libre, IBM_Plex_Mono, IBM_Plex_Sans_Hebrew } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Splash } from "@/components/Splash";
import { he } from "@/lib/i18n/he";
import "./globals.css";

// The SoloR design system's three families: a warm Hebrew serif for titles and the cut's name (from the shop sign
// and the wine label), a sans for everything else, a mono for codes and the reservation timer.
const display = Frank_Ruhl_Libre({ subsets: ["hebrew", "latin"], weight: ["500", "600", "700", "800"], variable: "--font-frank" });
const sans = IBM_Plex_Sans_Hebrew({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "SoloR",
  description: he.app.tagline,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SoloR", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f0b09",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <Splash />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
