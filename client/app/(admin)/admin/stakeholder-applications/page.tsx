import { redirect } from 'next/navigation'

// Applications are listed per stakeholder type; the dashboard's "Needs
// attention" link lands on the first one, and the sidebar lists the rest.
export default function Page() {
  redirect('/admin/stakeholder-applications/vc')
}
