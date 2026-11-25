import type { MetadataRoute } from 'next'

// The public pages. Everything else is behind sign-in and kept out of search.
const lastModified = new Date()

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://aiamplify.potential.org', lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: 'https://aiamplify.potential.org/sign-up', lastModified, changeFrequency: 'monthly', priority: 0.6 },
  ]
}
