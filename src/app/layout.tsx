import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import { ServiceWorker } from "@/components/ServiceWorker";
import { he } from "@/lib/i18n/he";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], weight: ["400", "600", "800"], variable: "--font-heebo" });

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
  themeColor: "#0e0e0e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
