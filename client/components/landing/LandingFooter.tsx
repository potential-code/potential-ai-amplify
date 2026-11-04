import Link from 'next/link'
import { Facebook, Linkedin, Mail, MessageCircle } from 'lucide-react'
import { btn } from '@/components/kit'
import { FOOTER } from '@/lib/constants/content'
import { FOOTER_LINKS, LEGAL_LINKS } from '@/lib/constants/navigation'
import { cn } from '@/lib/utils'

const SHARE_URL = 'https://aiamplify.potential.org'
const SHARE_TEXT = 'Grow your business with AI training, mentors, and tools: AI Amplify by Potential'
const LI_SUMMARY = 'Put AI to work in your business with AI Amplify'

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  )
}

const SHARE_LINKS = [
  {
    label: 'Share on X',
    href: `https://twitter.com/share?url=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    Icon: XIcon,
  },
  {
    label: 'Share on Facebook',
    href: `https://www.facebook.com/sharer.php?u=${encodeURIComponent(SHARE_URL)}&text=${encodeURIComponent(SHARE_TEXT)}`,
    Icon: Facebook,
  },
  {
    label: 'Share on LinkedIn',
    href: `https://www.linkedin.com/cws/share?url=${encodeURIComponent(SHARE_URL)}&summary=${encodeURIComponent(LI_SUMMARY)}`,
    Icon: Linkedin,
  },
  {
    label: 'Share on WhatsApp',
    href: `https://api.whatsapp.com/send?phone=&text=${encodeURIComponent(`${SHARE_TEXT} : ${SHARE_URL}`)}`,
    Icon: MessageCircle,
  },
] as const

/** "Government Entities" → "Government entities", "Home Page" → "Home page". */
const sentence = (s: string) => (s === 'VCs' ? s : s.charAt(0) + s.slice(1).toLowerCase())

const linkCls = 'text-sm text-ui-muted transition-colors hover:text-ui-text'

export function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-ui-line bg-ui-surface">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-[22px] pt-8 min-[900px]:px-10">
        <div className="grid grid-cols-1 gap-8 min-[900px]:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3.5">
            <img src="/images/redesign/potential-logo.png" alt="AI Amplify" className="h-10 w-auto self-start" />
            <p className="max-w-[300px] text-sm leading-[1.55] text-ui-muted">
              AI Amplify by Potential: AI courses, AI and human mentors, live events and AI tools for SMEs.
            </p>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-ui-text">Share the program</span>
              <div className="flex gap-2">
                {SHARE_LINKS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className={cn(btn({ variant: 'secondary', size: 'icon' }), 'h-[38px] w-[38px]')}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <nav aria-labelledby="f-links" className="flex flex-col gap-2.5">
            <h2 id="f-links" className="mb-1 text-sm font-semibold text-ui-text">
              Important links
            </h2>
            {FOOTER_LINKS.importantLinks.map((l) => {
              const label = ({ Login: 'Sign in', 'Home Page': 'Home page' } as Record<string, string>)[l.label] ?? l.label
              return l.href.startsWith('http') ? (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {label}
                </a>
              ) : (
                <Link key={l.label} href={l.href} className={linkCls}>
                  {label}
                </Link>
              )
            })}
          </nav>

          <nav aria-labelledby="f-stake" className="flex flex-col gap-2.5">
            <h2 id="f-stake" className="mb-1 text-sm font-semibold text-ui-text">
              Stakeholders
            </h2>
            {FOOTER_LINKS.stakeholderLinks.map((l) => (
              <a key={l.label} href="#stakeholder" className={linkCls}>
                {sentence(l.label)}
              </a>
            ))}
          </nav>

          <div className="flex flex-col gap-2.5">
            <h2 className="mb-1 text-sm font-semibold text-ui-text">Get in touch</h2>
            <p className="text-sm leading-normal text-ui-muted">For any inquiries about the program, contact us at:</p>
            <a href={`mailto:${FOOTER.contactEmail}`} className={cn(btn({ variant: 'secondary' }), 'self-start')}>
              <Mail className="h-[18px] w-[18px]" aria-hidden />
              {FOOTER.contactEmail}
            </a>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-ui-line pt-5 min-[900px]:flex-row min-[900px]:items-center">
          <span className="text-[13px] text-ui-muted">Potential © 2005-{year}. All rights reserved.</span>
          <span className="flex gap-5">
            <a href={LEGAL_LINKS.privacy} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ui-muted hover:text-ui-text">
              Privacy Policy
            </a>
            <a href={LEGAL_LINKS.terms} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ui-muted hover:text-ui-text">
              Terms of Use
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
