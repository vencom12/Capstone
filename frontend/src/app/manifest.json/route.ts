import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  let logoUrl = '/favicon.ico';
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
    const res = await fetch(`${apiUrl}/api/customer/settings`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.businessLogoUrl) {
        logoUrl = data.businessLogoUrl;
      }
    }
  } catch (e) {
    console.error('Manifest fetch error:', e);
  }

  return NextResponse.json({
    name: "Stitch-Opt | Premium Embroidery Designs",
    short_name: "Stitch-Opt",
    description: "Custom embroidery designs & personalized monogramming for towels, fans, and more.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#6366f1",
    icons: [
      {
        src: logoUrl,
        sizes: "192x192 512x512 any",
        type: "image/png"
      }
    ]
  });
}
