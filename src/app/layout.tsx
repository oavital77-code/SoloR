import type { Metadata, Viewport } from "next";
import { Heebo, IBM_Plex_Mono } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { Loader, seenScript } from "@/components/motion/Loader";
import { he } from "@/lib/i18n/he";
import "./globals.css";

// One Hebrew sans for the whole site (Heebo, SIL OFL): heavy 900 titles, 400–800 for the rest (design: נייר קצבים ×
// אפליקציה); a mono for codes, stickers and the reservation timer.
const brand = Heebo({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700", "800", "900"], variable: "--font-brand" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: he.app.name,
  description: he.app.tagline,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: he.app.name, statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b1712",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${brand.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <script dangerouslySetInnerHTML={{ __html: seenScript }} />
        <Loader />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
