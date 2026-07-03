import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Amplify — Amplify Your Business with AI | Powered by Potential.org',
  description:
    "Learn to put AI to work in your business: cut costs, win more customers, and build future-ready skills — free with AI Amplify, Potential.org's global program for SMEs and job seekers.",
  keywords: 'AI Amplify, SME, AI, business empowerment, startup, digital transformation, AI tools',
  openGraph: {
    title: 'AI Amplify — Amplify Your Business with AI',
    description: 'Free AI-powered program for SMEs, startups, and job seekers worldwide.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  )
}
