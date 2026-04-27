import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "StitchOpt | Premium Embroidery Services",
  description: "High-quality custom embroidery, digitizing, and apparel production tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} antialiased`}>
      <body className="font-outfit">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
