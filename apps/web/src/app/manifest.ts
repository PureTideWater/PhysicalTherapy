import type { MetadataRoute } from 'next';

import { BRAND_BACKGROUND_COLOR, BRAND_NAME, BRAND_TAGLINE, BRAND_THEME_COLOR } from '../lib/brand';

/** Web app manifest. app/icon.svg (favicon) and app/apple-icon.png are picked up by Next automatically. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: BRAND_TAGLINE,
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_BACKGROUND_COLOR,
    theme_color: BRAND_THEME_COLOR,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
