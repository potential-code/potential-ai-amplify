// Shared AI Amplify platform knowledge — imported by both chatbots.
// Keep this file as the single source of truth for platform facts.
// Sourced from: client/lib/constants/content.ts, landing page sections,
// dashboard data, and the actual schema/features in the codebase.

export const AI_AMPLIFY_PLATFORM_KNOWLEDGE = `
---

## AI AMPLIFY PLATFORM KNOWLEDGE BASE

Use this for platform overview and FAQ only. For show/find/recommend queries (courses, mentors, offers, events), ALWAYS follow the SEMANTIC MATCHING and DISCOVERY rules above — call searchCatalogue and the appropriate show*Cards action. Never answer those from this static text.

### What is AI Amplify?
AI Amplify is a global initiative by the Potential.org Foundation. It gives small and medium businesses (SMEs) and startups access to AI training courses, AI mentors, AI business tools, human expert sessions, exclusive partner offers, and live events.

### Contact
- info@potential.com

### The Six Core Pillars
1. **AI Training Courses** — structured video-based modules with action plans and certificates upon completion
2. **AI Mentors** — 6 AI coaches available 24/7, each specialised in a different business domain
3. **AI Business Tools** — generate Business Plans, Marketing Plans, Business Ideas, and Product Proposals as branded PDFs delivered to your email
4. **Human Mentors** — 15+ verified real-world experts bookable for private 1:1 sessions
5. **Special SME Offers** — exclusive partner discounts redeemable with earned points
6. **Live Events** — online webinars, workshops, and in-person events with AI and business experts

### How Courses Work
Each course consists of video units with reflection/survey questions and action planning exercises. Completing a full course earns you points and an automatic certificate. Three course tracks are available: Transform with AI, Digitize Your Business, and Additional Courses.

### How AI Mentors Work
6 AI coaches (covering Security, Sales, Marketing, Legal, Sustainability, and Leadership) are available 24/7 via chat from the AI Mentors section. Each specialises in a different business domain.

### How AI Business Tools Work
Four tools — Business Idea Generator, Business Plan Generator, Marketing Plan Creator, and Product/Sales Proposal Tool. Each guides you through a step-by-step conversation, then generates a complete branded document delivered as a PDF to your email.

### How Human Mentor Sessions Work
15+ verified experts across Strategy, Marketing, Finance, Legal, Leadership, and Operations. Browse the Human Mentors section, select an expert, and use the booking widget to reserve a 1:1 slot.

### Points & Offers
- Earn points by completing courses.
- Redeem points for exclusive partner discounts in the Offers section.

### Certificates
Automatically issued when you complete a course. Viewable and downloadable from your Profile page under Achievements.

### Stakeholder Programs (for organisations)
Six programs for non-SME participants: Experts, VC, Government, Corporate, University, and Incubator. Contact info@potential.com for details.

### FAQ

**Q: Who can join?**
Any SME owner, startup founder, or entrepreneur, anywhere in the world.

**Q: What can I access after registering?**
Immediately: all courses, AI mentors (24/7), AI business tools, partner offers, and live events.

**Q: How do I earn points?**
Complete courses to earn points. Points accumulate as you finish each course.

**Q: What can I do with my points?**
Redeem them for exclusive partner discounts and offers in the Offers section.

**Q: How do I get a certificate?**
Certificates are issued automatically when you complete a course. Find them in your Profile under Achievements.

**Q: How do I book a human mentor session?**
Go to Human Mentors, browse the available experts, and use the booking widget to select an available slot.

**Q: How many AI mentors are there?**
6 AI mentors, each specialised in a different domain: Security & Safety, Sales, Marketing, Legal, Sustainability, and Leadership. Available 24/7.

**Q: What AI business tools are available?**
Four tools: Business Idea Generator, Business Plan Generator, Marketing Plan Creator, and Product/Sales Proposal Tool. Each produces a branded PDF delivered to your email.

**Q: How do I contact support?**
Email info@potential.com or use the Support page in the dashboard.

**Q: Can my organisation partner with AI Amplify?**
Yes — through one of the six stakeholder programs (Experts, VC, Government, Corporate, University, Incubator). Contact info@potential.com.

**Q: What results have others seen?**
Real members have cut customer-support costs by 38% in 90 days, booked 20% more calls using AI agents, and described the free mentor sessions as "worth thousands."
`

// Landing-page-specific knowledge — only imported by LandingRegistrationChat.
// Focuses on conversion: why register, what users get immediately, how fast registration is.
export const LANDING_AI_AMPLIFY_KNOWLEDGE = `
## LANDING PAGE CONTEXT

Use this to answer visitor questions about joining and getting started.

### Why Register?
- Immediate access to every AI Amplify feature — no waiting list, no approval process
- Results members have reported: 38% reduction in customer-support costs, 20% more booked calls with AI agents, and mentor sessions they call "worth thousands"

### Registration Process
- Takes under 2 minutes
- Fields required: Full name · Email address · Password · Country · Optional invite code
- Immediately redirected to the full dashboard upon completion

### What Happens After Registering?
- Instant access to all AI training courses, AI mentors (24/7), AI business tools, human mentor bookings, partner offers, and live events
- Start earning points by completing course units
- Redeem points for exclusive partner discounts (AWS, Cisco, and more)

NOTE: The AI Business Tools (Business Plan, Marketing Plan, etc.) run inside the dashboard — they cannot be used here on the landing page. If a visitor asks to use one, describe the tool briefly and encourage them to register for free access.
`
