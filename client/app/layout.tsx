import type { Metadata } from 'next'
import { Geist, Noto_Sans, Noto_Sans_Arabic, Noto_Sans_Devanagari } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

// Glyph fallbacks for the Arabic, Urdu and Hindi text Geist lacks (--font-ui in
// globals.css). Self-hosted with the site, split by unicode-range, so a browser
// downloads a file only when the page shows those characters: nothing on an
// English page. Not preloaded, because Geist is the font for Latin text.
// (next/font needs literal options in each call.)
const notoSans = Noto_Sans({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto',
})
const notoSansArabic = Noto_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-arabic',
})
const notoSansDevanagari = Noto_Sans_Devanagari({
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-noto-devanagari',
})
const fontVariables = [geist, notoSans, notoSansArabic, notoSansDevanagari].map((f) => f.variable).join(' ')

// Icons and the shared-link image are files in this folder (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.jpg, twitter-image.jpg); Next adds their
// tags. metadataBase makes the image URLs absolute, which link previews need.
export const metadata: Metadata = {
  metadataBase: new URL('https://aiamplify.potential.org'),
  // Each page sets its own title, shown as "Courses | AI Amplify"; the homepage keeps the full name.
  title: { default: 'AI Amplify — Amplify Your Business with AI | Powered by Potential.org', template: '%s | AI Amplify' },
  description:
    "Learn to put AI to work in your business: cut costs, win more customers, and build future-ready skills with AI Amplify, Potential.org's global program for SMEs and job seekers.",
  keywords: 'AI Amplify, SME, AI, business empowerment, startup, digital transformation, AI tools',
  openGraph: {
    title: 'AI Amplify — Amplify Your Business with AI',
    description: 'AI training, mentors and tools for SMEs, startups and job seekers worldwide. By Potential.org.',
    type: 'website',
    siteName: 'AI Amplify',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Amplify — Amplify Your Business with AI',
    description: 'AI training, mentors and tools for SMEs, startups and job seekers worldwide. By Potential.org.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`scroll-smooth ${fontVariables}`} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {/* Saved dark mode for the signed-in app, applied before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(/^\\/(dashboard|mentor\\/dashboard|admin)(\\/|$)/.test(location.pathname)&&localStorage.getItem('amplify.theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  )
}
