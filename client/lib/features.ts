// client/lib/features.ts
// Features that can be switched off for the whole site. One Dokploy variable
// drives each: docker-compose passes it to the API as an env var and to this
// build as NEXT_PUBLIC_*, so the server and the pages always agree.

/**
 * Human mentors: the Human Mentors page, booking, My Sessions, and every link,
 * card and Anna suggestion that leads there. Off until real mentors can sign in
 * and set their times (HUMAN_MENTORS_ENABLED=true on Dokploy, then redeploy).
 */
export const HUMAN_MENTORS_ENABLED = process.env.NEXT_PUBLIC_HUMAN_MENTORS_ENABLED === 'true'
