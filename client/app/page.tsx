import type { Metadata } from 'next'
import Home from '@/views/Home'

export const metadata: Metadata = { alternates: { canonical: '/' } }

// Structured data for search engines: who runs the programme.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  "name": "AI Amplify",
  "url": "https://aiamplify.potential.org/",
  "logo": "https://aiamplify.potential.org/icon.svg",
  "description": "AI training, mentors and tools for SMEs, startups and job seekers worldwide. By Potential.org.",
  "parentOrganization": {
    "@type": "NGO",
    "name": "Potential.org",
    "url": "https://potential.org"
  }
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify of a constant; '<' escaped so it can't close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD).replace(/</g, '\\u003c') }}
      />
      <Home />
    </>
  )
}
