import type { Request, Response, NextFunction } from 'express'
import * as svc from '../services/liveEvents.service'
import { hostStartUrl } from '../services/eventZoom.service'
import { zoomErrorSummary, zoomInfo } from '../services/zoom'
import { AppError } from '../utils/app-error'

/** Live events: public list, a learner's own view and bookings, and admin management. */

type Handler<P = Record<string, string>> = (req: Request<P>, res: Response, next: NextFunction) => Promise<void>
const wrap =
  <P = Record<string, string>>(fn: (req: Request<P>, res: Response) => Promise<unknown>): Handler<P> =>
  async (req, res, next) => {
    try {
      const data = await fn(req, res)
      if (!res.headersSent) res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  }

/** GET /api/live-events — published events, without links (public). */
export const listPublished = wrap(() => svc.listPublishedEvents())
/** GET /api/live-events/mine — published events with the learner's bookings and join links. */
export const listMine = wrap((req) => svc.listForLearner(req.user!.userId))
export const rsvp = wrap<{ id: string }>((req) => svc.rsvp(req.user!.userId, req.params.id))
export const cancelRsvp = wrap<{ id: string }>((req) => svc.cancelRsvp(req.user!.userId, req.params.id))

export const listAll = wrap(() => svc.listAllEvents())
export const zoomStatus = wrap(async () => zoomInfo())
export const createEvent = wrap(async (req, res) => {
  res.status(201)
  return svc.createEvent(req.user!.userId, req.body as svc.EventInput)
})
export const updateEvent = wrap<{ id: string }>((req) => svc.updateEvent(req.params.id, req.body as Partial<svc.EventInput>))
export const deleteEvent = wrap<{ id: string }>(async (req) => {
  await svc.deleteEvent(req.params.id)
  return { ok: true }
})
export const bookings = wrap<{ id: string }>((req) => svc.listBookings(req.params.id))
export const resyncZoom = wrap<{ id: string }>((req) => svc.resyncZoom(req.params.id))

/** GET /api/live-events/:id/zoom/start-url — the host link, fetched fresh from Zoom. */
export const startUrl = wrap<{ id: string }>(async (req) => {
  const event = await svc.getEvent(req.params.id)
  if (!event) throw new AppError('Event not found', 404, 'NOT_FOUND')
  try {
    return { url: await hostStartUrl(event) }
  } catch (err) {
    throw new AppError(zoomErrorSummary(err), 502, 'ZOOM_FAILED')
  }
})

export const exportBookings: Handler<{ id: string }> = async (req, res, next) => {
  try {
    const file = await svc.exportBookings(req.params.id, req.query['format'] === 'csv' ? 'csv' : 'xlsx')
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(file.body)
  } catch (err) {
    next(err)
  }
}
