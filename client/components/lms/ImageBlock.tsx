'use client'

import { type LearnerBlock } from '@/lib/api/lms'

type Props = {
  block: LearnerBlock
  onCompleted: () => void
  onAdvance?: () => void
}

export function ImageBlock({ block }: Props) {
  return (
    <div>

      {block.imageUrl && (
        <div className="flex justify-center">
          <img
            src={block.imageUrl}
            alt={block.title}
            className="max-h-96 w-auto rounded-[10px] border border-ui-line shadow-sm object-contain"
          />
        </div>
      )}
    </div>
  )
}
