import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Cairo } from "next/font/google";
import { cn } from "@/lib/utils";

// Cairo is the v5 font (--font: Cairo, sans-serif).
const cairo = Cairo({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SPOT",
  description: "Scouting Platforms On Time — FRC scouting by Team 3061 Huskie Robotics",
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", cairo.variable)}>
      <body className="bg-background text-foreground min-h-dvh antialiased">{children}</body>
    </html>
  );
}
