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
        }
      })
      .catch(err => console.error('Failed to load dynamic favicon', err));
  }, []);

  return null;
}
