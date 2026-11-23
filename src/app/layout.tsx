import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "SPOT Scouting",
  description: "No-code FRC scouting: build your scouting app, scoring and analysis from the admin dashboard.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/favicon-32x32.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

// Apply the saved/system theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
