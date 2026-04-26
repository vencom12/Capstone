import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/dashboard', '/employee'],
    },
    sitemap: 'https://stitchopt.com/sitemap.xml',
  }
}
