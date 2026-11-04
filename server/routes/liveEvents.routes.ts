import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../middleware/validate'
import { authenticate } from '../middleware/authenticate'
import { requireRole } from '../middleware/require-role'
import * as ctrl from '../controllers/liveEvents.controller'
import { httpUrl } from '../utils/httpUrl'

const router = Router()

// null / "" → undefined so DB nulls don't fail re-save on optional fields
const optionalUrl = z.preprocess((v) => (v === '' || v === null ? undefined : v), httpUrl(1000).optional())
const optionalStr = (max: number) => z.preprocess((v) => (v === null ? undefined : v), z.string().max(max).trim().optional())

const fields = {
  title: z.string().min(1).max(300).trim(),
  description: optionalStr(3000),
  type: z.string().min(1).max(100).trim(),
  /** An ISO date-time with its offset; the admin enters UAE time. */
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(600),
  format: z.enum(['zoom', 'link', 'in_person']),
  meetingLink: optionalUrl,
  location: optionalStr(300),
  recordingLink: optionalUrl,
  coverImage: optionalStr(1000),
  status: z.enum(['draft', 'published']),
}

const createDto = z.object({
  ...fields,
  type: fields.type.default('Webinar'),
  durationMinutes: fields.durationMinutes.default(60),
  format: fields.format.default('link'),
  status: fields.status.default('draft'),
})
const updateDto = z.object(fields).partial().refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' })

// ── Public and learner ───────────────────────────────────────────────────────

/** Published events without links (the landing page). */
router.get('/', ctrl.listPublished)
/** Published events with the learner's bookings and, once booked, how to join. */
router.get('/mine', authenticate, ctrl.listMine)
router.post('/:id/rsvp', authenticate, requireRole('sme'), ctrl.rsvp)
router.delete('/:id/rsvp', authenticate, requireRole('sme'), ctrl.cancelRsvp)

// ── Admin ────────────────────────────────────────────────────────────────────

router.get('/admin', authenticate, requireRole('admin'), ctrl.listAll)
router.get('/admin/zoom', authenticate, requireRole('admin'), ctrl.zoomStatus)
router.post('/', authenticate, requireRole('admin'), validate(createDto), ctrl.createEvent)
router.patch('/:id', authenticate, requireRole('admin'), validate(updateDto), ctrl.updateEvent)
router.delete('/:id', authenticate, requireRole('admin'), ctrl.deleteEvent)
router.get('/:id/bookings', authenticate, requireRole('admin'), ctrl.bookings)
router.get('/:id/bookings/export', authenticate, requireRole('admin'), ctrl.exportBookings)
router.post('/:id/zoom/resync', authenticate, requireRole('admin'), ctrl.resyncZoom)
router.get('/:id/zoom/start-url', authenticate, requireRole('admin'), ctrl.startUrl)

export default router
