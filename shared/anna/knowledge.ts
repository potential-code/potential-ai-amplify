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
Each course consists of video units with reflection/survey questions and action planning exercises. Completing a full course earns you points and an automatic certificate.

The core curriculum is six flagship AI courses, "The Entrepreneur's Journey":
1. AI Fundamentals
2. AI Ethics and Data Privacy
3. Generative AI, LLMs and Diffusion Models
4. AI in Daily Workflows
5. Prompt Engineering and AI Troubleshooting
6. AI's Future and Continuous Learning

Beyond these six, members also get a large library of additional courses covering broader business skills (e.g. digital marketing, cash flow management, negotiation, leadership, and more).

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

**Q: Is AI Amplify free?**
No. AI Amplify is a paid program — it is not free to join and there is no free tier. Do not describe it as free, free-to-access, or free-to-join under any circumstances.

**Q: What can members access?**
All courses (including the six flagship AI courses), AI mentors (24/7), AI business tools, partner offers, and live events.

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
// This chat does NOT handle registration — it can only log in existing
// members. Never frame answers around "how to register" or imply self-serve
// sign-up is available here.
export const LANDING_AI_AMPLIFY_KNOWLEDGE = `
## LANDING PAGE CONTEXT

Use this to answer visitor questions about AI Amplify and to help existing members log in. This chat cannot register new accounts — see the REGISTRATION REDIRECT guardrail for how to handle sign-up requests.

### Is AI Amplify free?
No — it is a paid program, not a free platform. Never say or imply it is free, free-to-access, free-to-join, or has a free tier. If asked about pricing, say it's a paid program and that the team can be contacted for details — do not invent a specific price.

### What Members Get Access To
- All AI training courses — including the six flagship courses in "The Entrepreneur's Journey" (AI Fundamentals; AI Ethics and Data Privacy; Generative AI, LLMs and Diffusion Models; AI in Daily Workflows; Prompt Engineering and AI Troubleshooting; AI's Future and Continuous Learning) — plus a wider library of additional business-skills courses
- AI mentors (24/7), AI business tools, human mentor bookings, partner offers, and live events
- Points earned by completing course units, redeemable for exclusive partner discounts (AWS, Cisco, and more)

NOTE: The AI Business Tools (Business Plan, Marketing Plan, etc.) run inside the member dashboard — they cannot be used here on the landing page. If a visitor asks to use one, describe the tool briefly; do not tell them to register or sign up — only existing members can log in to use it.
`
