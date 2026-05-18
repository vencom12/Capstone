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
  title: 'Stitch-Opt | Premium Embroidery Designs',
  description: 'Explore our curated catalog of professional embroidery designs optimized for high-speed production.',
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
