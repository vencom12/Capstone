import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import ToastContainer from '@/components/ui/Toast';
import DynamicFavicon from '@/components/ui/DynamicFavicon';
import GlobalAuthListener from '@/components/auth/GlobalAuthListener';
import AuthModal from '@/components/auth/AuthModal';
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700', '800'],
  variable: '--font-outfit',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#090d16',
};

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
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('stitch_theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${outfit.variable} font-sans antialiased`} suppressHydrationWarning>
        <ServiceWorkerRegister />
        <Suspense fallback={null}>
          <GlobalAuthListener />
        </Suspense>
        {children}
        <Suspense fallback={null}>
          <AuthModal />
        </Suspense>
        <DynamicFavicon />
        <ToastContainer />
      </body>
    </html>
  );
}
