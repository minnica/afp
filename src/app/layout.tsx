import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { RequestErrorDialog } from "@/components/ui/request-error-dialog";
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
  themeColor: "#09090b",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "Control de Gastos",
  description: "App personal para gastos, tarjetas y cuentas por cobrar",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/app-icon.svg?v=3", type: "image/svg+xml", sizes: "any" }],
    apple: [{ url: "/icons/apple-touch-icon-v3.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gastos",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <DashboardProvider>{children}</DashboardProvider>
        <RequestErrorDialog />
        <Toaster richColors position="bottom-center" />
      </body>
    </html>
  );
}
