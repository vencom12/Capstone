import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import ToastContainer from '@/components/ui/Toast';
import WelcomeTransition from '@/components/ui/WelcomeTransition';
import DynamicFavicon from '@/components/ui/DynamicFavicon';
import GlobalAuthListener from '@/components/auth/GlobalAuthListener';
import AuthModal from '@/components/auth/AuthModal';
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister';
import InstallAppModal from '@/components/pwa/InstallAppModal';
import AppUpdateBanner from '@/components/pwa/AppUpdateBanner';

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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#090d16' },
    { media: '(prefers-color-scheme: light)', color: '#090d16' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL('https://capstone-btr7.onrender.com'),
  title: {
    default: 'Edz Towels & Caps',
    template: '%s | Edz Towels & Caps',
  },
  description: 'Explore our curated collection of professional embroidery products optimized for high-speed production. Custom monogramming, towels, fans, caps, and more.',
  keywords: ['embroidery', 'monogramming', 'custom towels', 'personalized gifts', 'Edz Towels & Caps', 'custom caps', 'embroidered fans'],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Edz Towels & Caps | Premium Embroidery Products',
    description: 'Explore our curated collection of professional embroidery products optimized for high-speed production.',
    url: 'https://capstone-btr7.onrender.com',
    siteName: 'Edz Towels & Caps',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'Edz Towels & Caps | Premium Embroidery Products',
    description: 'Custom embroidery products & personalized monogramming for towels, fans, caps, and more.',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Edz Embroidery',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          id="theme-initializer"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('stitch_theme')||'light';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#090d16':'#f8fafc');}catch(e){}})();`,
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
        <WelcomeTransition />
        <DynamicFavicon />
        <ToastContainer />
        <InstallAppModal />
        <AppUpdateBanner />
      </body>
    </html>
  );
}
