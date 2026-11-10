import multer from 'multer'
import crypto from 'crypto'
import fs from 'fs'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/app-error'
import { uploadsPath } from '../config/uploads'

const UPLOADS_DIR = uploadsPath('media')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// Allowed upload types and the extension each is saved with. The extension
// comes from this map, never from the client's filename, so a file sent as
// image/png but named page.html is still saved (and served) as .png.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = ALLOWED_TYPES[file.mimetype] ?? ''
    const hash = crypto.randomBytes(8).toString('hex')
    cb(null, `${Date.now()}-${hash}${ext}`)
  },
})

export const uploadMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (Object.hasOwn(ALLOWED_TYPES, file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('FILE_TYPE_NOT_ALLOWED'))
    }
  },
})

// ---------------------------------------------------------------------------
// Mentor profile photo
// ---------------------------------------------------------------------------

const AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

const avatarMulter = multer({
  // In memory: the service sniffs the real image type before anything is
  // written to disk (the client-supplied mimetype is only a first filter).
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIMES.has(file.mimetype)) cb(null, true)
    else cb(new AppError('Photo must be a JPEG, PNG or WebP image', 415, 'UNSUPPORTED_IMAGE'))
  },
}).single('photo')

/**
 * Accepts one `photo` file (JPEG/PNG/WebP, max 5 MB) into `req.file`.
 * Multer's own errors are mapped to AppErrors so clients get a 4xx with a
 * clear code instead of a 500.
 */
export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  avatarMulter(req, res, (err: unknown) => {
    if (!err) return next()
    if (err instanceof AppError) return next(err)
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Photo must be 5 MB or smaller', 413, 'FILE_TOO_LARGE'))
      return next(new AppError('Send one image in the "photo" field', 400, 'INVALID_UPLOAD'))
    }
    next(err)
  })
}
