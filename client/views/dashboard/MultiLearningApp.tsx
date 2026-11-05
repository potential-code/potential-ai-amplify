'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import MultiLearningPage from '@/views/dashboard/MultiLearning'

/** Below this width the screen is already a phone: show the tutor itself. */
const PHONE_MAX = 640
const FRAME_W = 390
const FRAME_H = 844

/**
 * Multi Learning as the mobile app it is meant to be: the tutor alone, with no
 * dashboard around it. On a phone it fills the screen. On a larger screen it
 * runs inside a phone-sized frame, an iframe at phone width, so the tutor's own
 * layout is the real phone layout rather than a squeezed desktop one.
 */
export default function MultiLearningAppPage() {
  const [mode, setMode] = useState<'app' | 'frame' | null>(null)

  useEffect(() => {
    const inFrame = new URLSearchParams(window.location.search).get('frame') === '0'
    setMode(inFrame || window.innerWidth < PHONE_MAX ? 'app' : 'frame')
  }, [])

  if (mode === null) return <div className="h-dvh bg-ui-bg" aria-busy="true" />
  if (mode === 'app') return <MultiLearningPage standalone />
  return <PhoneFrame />
}

function PhoneFrame() {
  // Fit the device to the window height, never larger than a real phone.
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 140) / (FRAME_H + 28)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[radial-gradient(ellipse_at_top,var(--ui-brand-soft),var(--ui-bg)_60%)] px-4 py-6">
      <div className="flex items-center gap-3">
        <Image src="/images/AI Amplify-logo.png" alt="AI Amplify" width={120} height={40} className="h-9 w-auto" />
        <span className="text-sm font-medium text-ui-muted">Interactive Learning, on your phone</span>
      </div>
      <div
        style={{ width: FRAME_W + 28, height: FRAME_H + 28, transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: (FRAME_H + 28) * (scale - 1) }}
        className="rounded-[52px] bg-[#16121a] p-[14px] shadow-[0_30px_80px_-20px_rgba(60,10,40,0.45)]"
      >
        <iframe
          title="Interactive Learning app"
          src="/dashboard/multi-learning/app?frame=0"
          width={FRAME_W}
          height={FRAME_H}
          allow="microphone; autoplay"
          className="block rounded-[40px] border-0 bg-ui-bg"
        />
      </div>
      <p className="max-w-[46ch] text-center text-[13px] text-ui-muted">
        Open this page on a phone and Interactive Learning fills the screen, in English, Arabic, Hindi or Urdu.
      </p>
    </div>
  )
}
