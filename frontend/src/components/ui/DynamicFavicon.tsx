'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

export default function DynamicFavicon() {
  useEffect(() => {
    api.get<any>('/api/customer/settings')
      .then(res => {
        if (res && res.businessLogoUrl) {
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = res.businessLogoUrl;

          // Apple touch icon (iOS Safari)
          let appleLink = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
          if (!appleLink) {
            appleLink = document.createElement('link');
            appleLink.rel = 'apple-touch-icon';
            document.head.appendChild(appleLink);
          }
          appleLink.href = res.businessLogoUrl;

          // MS Application Tile (for Edge / Windows Start Menu)
          let msTile = document.querySelector("meta[name='msapplication-TileImage']") as HTMLMetaElement;
          if (!msTile) {
            msTile = document.createElement('meta');
            msTile.name = 'msapplication-TileImage';
            document.head.appendChild(msTile);
          }
          msTile.content = res.businessLogoUrl;
          // Dynamic Manifest Update
          const manifestObj = {
            name: res.businessName || "Stitch-Opt | Premium Embroidery Designs",
            short_name: "Stitch-Opt",
            start_url: "/",
            display: "standalone",
            background_color: "#0f172a",
            theme_color: "#6366f1",
            icons: [{ src: res.businessLogoUrl || "/favicon.ico", sizes: "192x192 512x512", type: "image/png" }]
          };
          const blob = new Blob([JSON.stringify(manifestObj)], { type: 'application/manifest+json' });
          const manifestUrl = URL.createObjectURL(blob);
          
          let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
          if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            document.head.appendChild(manifestLink);
          }
          manifestLink.href = manifestUrl;
        }
      })
      .catch(err => console.error('Failed to load dynamic favicon', err));
  }, []);

  return null;
}
