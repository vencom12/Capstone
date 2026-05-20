import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import ToastContainer from '@/components/ui/Toast';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700', '800'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://capstone-btr7.onrender.com'),
  title: {
    default: 'Stitch-Opt | Premium Embroidery Designs',
    template: '%s | Stitch-Opt',
  },
  description: 'Explore our curated catalog of professional embroidery designs optimized for high-speed production. Custom monogramming, towels, fans, and more.',
  keywords: ['embroidery', 'monogramming', 'custom towels', 'personalized gifts', 'Stitch-Opt'],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Stitch-Opt | Premium Embroidery Designs',
    description: 'Explore our curated catalog of professional embroidery designs optimized for high-speed production.',
    url: 'https://capstone-btr7.onrender.com',
    siteName: 'Stitch-Opt',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'Stitch-Opt | Premium Embroidery Designs',
    description: 'Custom embroidery designs & personalized monogramming for towels, fans, and more.',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} font-sans antialiased`} suppressHydrationWarning>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
