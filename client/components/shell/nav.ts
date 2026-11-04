import {
  Award,
  BarChart3,
  BookOpenCheck,
  Bot,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarCheck2,
  CalendarDays,
  CircleHelp,
  GraduationCap,
  House,
  ImageIcon,
  Landmark,
  LayoutDashboard,
  Link2,
  Rocket,
  School,
  Sparkles,
  Tag,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  Megaphone,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

export type ShellRole = 'learner' | 'mentor' | 'admin' | 'partner'

export type ShellNavItem = {
  label: string
  href: string
  icon: LucideIcon
  /** Only this exact path counts as active (role home pages). */
  exact?: boolean
}

export type ShellNavGroup = { title?: string; items: ShellNavItem[] }

export type ShellConfig = {
  roleLabel: string
  homeHref: string
  profileHref: string
  groups: ShellNavGroup[]
  /** Pinned under the groups, above the user card. */
  footer: ShellNavItem[]
  /** Phone bottom tab bar; the last slot is always "More" (opens the full menu). */
  tabs: ShellNavItem[]
  /** Shown in the phone top bar next to the menu button. */
  quickAction?: ShellNavItem
}

const ASK_ANNA: ShellNavItem = { label: 'Ask Anna', href: '/dashboard/anna', icon: Sparkles }

// The menus list the pages AI Amplify has today. Pages from the approved
// designs that don't exist yet (AI Examiner, Multi Learning…)
// join the menu when they are built. Learning Path, Content on Demand and
// Blended Learning stay out of the menu, as on the live site (b23e358).
export const SHELL_CONFIG: Record<ShellRole, ShellConfig> = {
  learner: {
    roleLabel: 'Learner',
    homeHref: '/dashboard',
    profileHref: '/dashboard/profile',
    groups: [
      { items: [{ label: 'Home', href: '/dashboard', icon: House, exact: true }, ASK_ANNA] },
      {
        title: 'Learn',
        items: [
          { label: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
          { label: 'Certificates', href: '/dashboard/certificates', icon: Award },
          { label: 'Achievements', href: '/dashboard/achievements', icon: Trophy },
        ],
      },
      {
        title: 'Mentors',
        items: [
          { label: 'AI Mentors', href: '/dashboard/ai-mentors', icon: Bot },
          { label: 'Human Mentors', href: '/dashboard/human-mentors', icon: Users },
          { label: 'My Sessions', href: '/dashboard/sessions', icon: CalendarCheck2 },
        ],
      },
      {
        title: 'Grow',
        items: [
          { label: 'Offers', href: '/dashboard/offers', icon: Tag },
          { label: 'Events', href: '/dashboard/events', icon: Calendar },
        ],
      },
    ],
    footer: [{ label: 'Support', href: '/dashboard/support', icon: CircleHelp }],
    tabs: [
      { label: 'Home', href: '/dashboard', icon: House, exact: true },
      { label: 'Courses', href: '/dashboard/courses', icon: GraduationCap },
      { label: 'Mentors', href: '/dashboard/ai-mentors', icon: Bot },
      { label: 'Events', href: '/dashboard/events', icon: Calendar },
    ],
    quickAction: ASK_ANNA,
  },
  mentor: {
    roleLabel: 'Mentor',
    homeHref: '/mentor/dashboard',
    profileHref: '/mentor/dashboard/profile',
    groups: [
      {
        items: [
          { label: 'Dashboard', href: '/mentor/dashboard', icon: LayoutDashboard, exact: true },
          { label: 'My Sessions', href: '/mentor/dashboard/sessions', icon: CalendarDays },
          { label: 'Availability', href: '/mentor/dashboard/availability', icon: CalendarCheck },
          { label: 'Mentees', href: '/mentor/dashboard/mentees', icon: Users },
        ],
      },
    ],
    footer: [],
    tabs: [
      { label: 'Dashboard', href: '/mentor/dashboard', icon: LayoutDashboard, exact: true },
      { label: 'Sessions', href: '/mentor/dashboard/sessions', icon: CalendarDays },
      { label: 'Availability', href: '/mentor/dashboard/availability', icon: CalendarCheck },
      { label: 'Mentees', href: '/mentor/dashboard/mentees', icon: Users },
    ],
  },
  partner: {
    roleLabel: 'Partner',
    homeHref: '/partner',
    profileHref: '/partner/profile',
    groups: [{ items: [{ label: 'Dashboard', href: '/partner', icon: LayoutDashboard, exact: true }] }],
    footer: [],
    tabs: [{ label: 'Dashboard', href: '/partner', icon: LayoutDashboard, exact: true }],
  },
  admin: {
    roleLabel: 'Administrator',
    homeHref: '/admin/dashboard',
    profileHref: '/admin/profile',
    groups: [
      {
        items: [
          { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
          { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
          { label: 'Invites', href: '/admin/invites', icon: Link2 },
          { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
        ],
      },
      {
        title: 'Content',
        items: [
          { label: 'Course Creation', href: '/admin/courses', icon: BookOpenCheck },
          { label: 'Live Events', href: '/admin/live-events', icon: CalendarDays },
          { label: 'Offers', href: '/admin/offers', icon: Tag },
          { label: 'Media Library', href: '/admin/media', icon: ImageIcon },
        ],
      },
      {
        title: 'People',
        items: [
          { label: 'Mentor Applications', href: '/admin/applications', icon: UserCheck },
          { label: 'Learners', href: '/admin/learners', icon: GraduationCap },
          { label: 'Organisations', href: '/admin/organisations', icon: Building2 },
          { label: 'AI safety', href: '/admin/ai-safety', icon: ShieldAlert },
        ],
      },
      {
        title: 'Stakeholders',
        items: [
          { label: 'VCs', href: '/admin/stakeholder-applications/vc', icon: TrendingUp },
          { label: 'Government', href: '/admin/stakeholder-applications/government', icon: Landmark },
          { label: 'University', href: '/admin/stakeholder-applications/university', icon: School },
          { label: 'Corporates', href: '/admin/stakeholder-applications/corporate', icon: Building2 },
          { label: 'Incubator', href: '/admin/stakeholder-applications/incubator', icon: Rocket },
        ],
      },
    ],
    footer: [],
    // Admin is desktop-first: phones get the top bar and menu only.
    tabs: [],
  },
}

export function isActive(pathname: string, item: ShellNavItem): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (item.exact) return path === item.href
  return path === item.href || path.startsWith(item.href + '/')
}

export function allItems(config: ShellConfig): ShellNavItem[] {
  return [...config.groups.flatMap((g) => g.items), ...config.footer]
}
