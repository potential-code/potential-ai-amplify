import { cn } from '@/lib/utils'

interface LogoProps {
  /** Visual scale — matches Navbar's existing h-9 (scrolled) / h-11 (transparent) sizing. */
  size?: 'sm' | 'md' | 'lg'
  /** `default` renders the brand gradient text; `inverted` renders solid white,
   *  for use over dark/transparent hero backgrounds (mirrors the old logo PNG's
   *  `brightness-0 invert` treatment). */
  tone?: 'default' | 'inverted'
  className?: string
  /** Optional path to a real logo image. Defaults to the Potential logo. */
  imageSrc?: string
}

const SIZE_CLASSES: Record<NonNullable<LogoProps['size']>, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
}

export function Logo({
  size = 'md',
  tone = 'default',
  className,
  imageSrc = '/images/redesign/potential-logo.png',
}: LogoProps) {
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt="Potential"
        className={cn(
          'transition-all duration-300',
          size === 'sm' ? 'h-9' : size === 'lg' ? 'h-14' : 'h-11',
          tone === 'inverted' && 'brightness-0 invert',
          className,
        )}
      />
    )
  }

  return (
    <span
      className={cn(
        'font-heading font-extrabold tracking-tight leading-none select-none',
        SIZE_CLASSES[size],
        tone === 'inverted' ? 'text-white' : 'text-gradient-brand',
        className,
      )}
    >
      AI Amplify
    </span>
  )
}
