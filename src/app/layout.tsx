import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Varela_Round } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Splash } from "@/components/Splash";
import { he } from "@/lib/i18n/he";
import "./globals.css";

// One rounded Hebrew sans (Varela Round, SIL OFL) for the whole site, titles included; a mono for codes and the
// reservation timer. Varela Round has a single weight, so bold text is drawn bolder by the browser.
const brand = Varela_Round({ subsets: ["hebrew", "latin"], weight: "400", variable: "--font-varela" });
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
    <html lang="he" dir="rtl" className={`${brand.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <Splash />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
