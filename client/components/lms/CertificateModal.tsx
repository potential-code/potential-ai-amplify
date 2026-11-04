'use client'

import { useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCertificate, type CourseCertificate } from '@/lib/api/lms'
import { Button } from '@/components/kit'

const SERVER_URL = ''

type Props = {
  open: boolean
  certificate: Pick<CourseCertificate, 'id' | 'certificateNumber' | 'certificateUrl'> | null
  courseTitle: string
  onClose: () => void
}

/** Saves the certificate PNG through the authenticated download endpoint. */
export async function saveCertificate(certificate: Pick<CourseCertificate, 'id' | 'certificateNumber'>) {
  try {
    const response = await downloadCertificate(certificate.id)
    if (!response.ok) {
      toast.error('Certificate download not available yet')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `certificate-${certificate.certificateNumber}.png`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('Failed to download certificate')
  }
}

export function CertificateModal({ open, certificate, courseTitle, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const certImageUrl = certificate?.certificateUrl ? `${SERVER_URL}${certificate.certificateUrl}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-modal-title"
        className="w-full max-w-2xl overflow-hidden rounded-[14px] border border-ui-line bg-ui-surface shadow-ui"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ui-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[13px] text-ui-muted">Certificate</p>
            <h2 id="cert-modal-title" className="truncate text-base font-semibold text-ui-text">
              {courseTitle}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" autoFocus>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-ui-bg px-5 py-5 sm:px-6">
          {certImageUrl ? (
            <img
              src={certImageUrl}
              alt={`Certificate for ${courseTitle}`}
              className="block h-auto w-full rounded-[10px] border border-ui-line"
            />
          ) : (
            <div className="flex min-h-[240px] items-center justify-center rounded-[10px] border border-ui-line bg-ui-surface text-sm text-ui-muted">
              {certificate ? 'Certificate preview not available' : 'Loading certificate'}
            </div>
          )}
          {certificate?.certificateNumber && (
            <p className="mt-3 text-center font-mono text-xs text-ui-muted">{certificate.certificateNumber}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 pb-5 pt-1 sm:px-6">
          <Button className="flex-1" disabled={!certificate} onClick={() => certificate && saveCertificate(certificate)}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
