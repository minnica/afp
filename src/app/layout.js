import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Control de Gastos",
  description: "App personal para gastos, tarjetas y cuentas por cobrar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gastos",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        {children}
        <Toaster richColors position="bottom-center" />
      </body>
    </html>
  );
}
