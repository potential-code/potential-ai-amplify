import type { MetadataRoute } from 'next'

// Search engines may crawl the public pages only. Signed-in areas also send
// X-Robots-Tag: noindex (next.config.ts), so a link that leaks is not indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/admin', '/mentor', '/partner', '/api/', '/unsubscribe'] }],
    sitemap: 'https://aiamplify.potential.org/sitemap.xml',
    host: 'https://aiamplify.potential.org',
  }
}
