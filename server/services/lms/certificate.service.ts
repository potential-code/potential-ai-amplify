import fs from 'fs'
import path from 'path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { db } from '../../db'
import {
  courses, assessments, courseEnrollments, courseCertificates,
  assessmentAttempts, userCourseProgress, users,
} from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { AppError } from '../../utils/app-error'
import type { CourseCertificate } from '../../db/schema'

function getCertDir(): string {
  return path.join(__dirname, '..', 'uploads', 'certificates')
}

/**
 * Checks all conditions required before a certificate can be issued.
 * Returns { canIssue: true } if all pass, or { canIssue: false, reason } on the first failure.
 */
export async function canIssueCertificate(
  userId: string,
  courseId: string,
): Promise<{ canIssue: boolean; reason?: string }> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) return { canIssue: false, reason: 'COURSE_NOT_FOUND' }

  if (!course.enableCertificate) return { canIssue: false, reason: 'CERTIFICATE_DISABLED' }

  const [enrollment] = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
  if (!enrollment) return { canIssue: false, reason: 'NOT_ENROLLED' }

  const [existing] = await db.select().from(courseCertificates)
    .where(and(eq(courseCertificates.userId, userId), eq(courseCertificates.courseId, courseId)))
  if (existing) return { canIssue: false, reason: 'ALREADY_ISSUED' }

  const [progress] = await db.select().from(userCourseProgress)
    .where(and(eq(userCourseProgress.userId, userId), eq(userCourseProgress.courseId, courseId)))
  if (!progress || progress.progressPercentage < 100) {
    return { canIssue: false, reason: 'PROGRESS_INCOMPLETE' }
  }

  const [postAssessment] = await db.select().from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.assessmentType, 'post')))

  if (postAssessment) {
    const attempts = await db.select().from(assessmentAttempts)
      .where(and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.assessmentId, postAssessment.id)))

    if (postAssessment.isGraded) {
      const hasPassed = attempts.some(a => a.passed === true)
      if (!hasPassed) return { canIssue: false, reason: 'POST_ASSESSMENT_NOT_PASSED' }
    } else {
      if (attempts.length === 0) return { canIssue: false, reason: 'POST_ASSESSMENT_NOT_ATTEMPTED' }
    }
  }

  return { canIssue: true }
}

/**
 * Renders a certificate PNG to disk using @napi-rs/canvas.
 * Canvas is 1200×850 px with brand colours matching the platform design system.
 *
 * @param certId            - The certificate UUID (used as the filename).
 * @param certificateNumber - Formatted cert reference string (e.g. CERT-17…-ABC).
 * @param userFullName      - Learner's display name.
 * @param courseTitle       - Title of the completed course.
 * @param issuedAt          - Date the certificate was issued.
 * @returns The relative URL stored in the DB (e.g. `/uploads/certificates/{certId}.png`).
 */
async function renderCertificatePng(
  certId: string,
  _certificateNumber: string,
  userFullName: string,
  courseTitle: string,
  issuedAt: Date,
): Promise<{ relativeUrl: string; absoluteFilePath: string }> {
  // Canvas matches the template image aspect ratio (842×596 → 1200×850, scale ≈ 1.426×)
  const WIDTH = 1200
  const HEIGHT = 850
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // ── Template background ────────────────────────────────────────────────────
  const templatePath = path.join(__dirname, '..', 'assets', 'certificate-template.jpg')
  const template = await loadImage(templatePath)
  ctx.drawImage(template, 0, 0, WIDTH, HEIGHT)

  // Shared text style: dark brand purple matching the certificate labels
  ctx.fillStyle = '#4a1942'
  ctx.textAlign = 'center'

  // ── Learner name — centred on the dotted line below "THIS IS TO CERTIFY THAT" ──
  ctx.font = 'italic bold 46px sans-serif'
  ctx.fillText(userFullName, WIDTH / 2, 272)

  // ── Course title — centred on the dotted line below "HAS SUCCESSFULLY COMPLETED" ──
  ctx.font = 'bold 34px sans-serif'
  const MAX_WIDTH = 760
  if (ctx.measureText(courseTitle).width > MAX_WIDTH) {
    // Two-line word wrap
    const words = courseTitle.split(' ')
    let line1 = ''
    let line2 = ''
    for (const word of words) {
      const attempt = line1 ? `${line1} ${word}` : word
      if (ctx.measureText(attempt).width > MAX_WIDTH && line1) {
        line2 = line2 ? `${line2} ${word}` : word
      } else {
        line1 = attempt
      }
    }
    ctx.fillText(line1, WIDTH / 2, 466)
    if (line2) ctx.fillText(line2, WIDTH / 2, 506)
  } else {
    ctx.fillText(courseTitle, WIDTH / 2, 478)
  }

  // ── Issue date — centred under the "DATE" label in the bottom-left section ──
  const formattedDate = issuedAt.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  ctx.font = '24px sans-serif'
  ctx.textAlign = 'center'
  // DATE section spans roughly x 100–270 in source (×1.426) → x 142–385 on canvas
  ctx.fillText(formattedDate, 264, 682)

  // ── Write to disk ─────────────────────────────────────────────────────────
  const certDir = getCertDir()
  fs.mkdirSync(certDir, { recursive: true })

  const filename = `${certId}.png`
  const absoluteFilePath = path.join(certDir, filename)
  const pngBuffer = canvas.toBuffer('image/png')
  fs.writeFileSync(absoluteFilePath, pngBuffer)

  return {
    relativeUrl: `/uploads/certificates/${filename}`,
    absoluteFilePath,
  }
}

/**
 * Issues a certificate for the user on the given course.
 * Creates the DB row, generates a PNG using @napi-rs/canvas, then updates
 * the row with the file path and public URL.
 *
 * @param userId   - UUID of the learner.
 * @param courseId - UUID of the course.
 */
export async function issueCertificate(userId: string, courseId: string): Promise<CourseCertificate> {
  // Fetch user and course in parallel — both are needed for the certificate canvas
  const [[user], [course]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(courses).where(eq(courses.id, courseId)),
  ])

  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND')
  if (!course) throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND')

  const certificateNumber = `CERT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

  // Insert the row first so we have the UUID to use as the filename
  const [cert] = await db.insert(courseCertificates)
    .values({ userId, courseId, certificateNumber })
    .returning()

  // Generate the PNG and write to disk
  const { relativeUrl, absoluteFilePath } = await renderCertificatePng(
    cert.id,
    certificateNumber,
    user.fullName,
    course.title,
    cert.issuedAt,
  )

  // Persist the file path and public URL back to the DB
  const [updated] = await db.update(courseCertificates)
    .set({
      certificateUrl: relativeUrl,
      filePath: absoluteFilePath,
    })
    .where(eq(courseCertificates.id, cert.id))
    .returning()

  return updated
}

/**
 * Returns all certificates issued to a given learner, ordered by most recently issued.
 * Joins with the courses table to include the course title in each result.
 *
 * @param userId - UUID of the learner.
 */
export async function getUserCertificates(userId: string) {
  return db
    .select({
      id: courseCertificates.id,
      userId: courseCertificates.userId,
      courseId: courseCertificates.courseId,
      certificateNumber: courseCertificates.certificateNumber,
      issuedAt: courseCertificates.issuedAt,
      certificateUrl: courseCertificates.certificateUrl,
      filePath: courseCertificates.filePath,
      status: courseCertificates.status,
      createdAt: courseCertificates.createdAt,
      courseTitle: courses.title,
    })
    .from(courseCertificates)
    .innerJoin(courses, eq(courseCertificates.courseId, courses.id))
    .where(eq(courseCertificates.userId, userId))
    .orderBy(desc(courseCertificates.issuedAt))
}

/**
 * Reads a certificate PNG from disk and returns it as a Buffer.
 * Throws AppError 404 if the certificate record or its file cannot be found.
 *
 * @param id - UUID of the certificate record.
 */
export async function getCertificateFile(id: string): Promise<Buffer> {
  const [cert] = await db.select().from(courseCertificates).where(eq(courseCertificates.id, id))
  if (!cert) throw new AppError('Certificate not found', 404, 'NOT_FOUND')
  if (!cert.filePath) throw new AppError('Certificate file not found', 404, 'CERT_FILE_NOT_FOUND')

  try {
    return fs.readFileSync(cert.filePath)
  } catch {
    throw new AppError('Certificate file not found on disk', 404, 'CERT_FILE_NOT_FOUND')
  }
}

/**
 * Best-effort auto-issue: checks eligibility and issues if all conditions pass.
 * Never throws — errors are swallowed because this runs as a side-effect of
 * progress recalculation and must not block the primary operation.
 */
export async function tryAutoIssueCertificate(userId: string, courseId: string): Promise<void> {
  try {
    const { canIssue } = await canIssueCertificate(userId, courseId)
    if (canIssue) {
      await issueCertificate(userId, courseId)
    }
  } catch {
    // intentionally swallowed — auto-issue is best-effort
  }
}
