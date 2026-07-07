// Hero section
export const HERO = {
  headline: 'Amplify Your Business with AI — Work Smarter, Grow Faster',
  subtext:
    "Learn to put AI to work in your business: cut costs, win more customers, and build future-ready skills with AI Amplify, Potential.org's global program for SMEs and job seekers.",
} as const

// About section
export const ABOUT = {
  badge: 'About AI Amplify',
  heading: 'About AI Amplify',
  body: "In today's fast-paced business world, those who harness AI have a real edge over the competition. AI Amplify is a comprehensive training program that equips you with the skills to unlock AI's full potential in your work.",
  outcomes: {
    heading: "What You'll Get",
    items: ['AI training courses', '24/7 AI coach', '1:1 expert sessions', 'Partner discounts'],
  },
  audience: {
    heading: "Who It's For",
    items: ['SME owners', 'Job seekers', 'Non-technical teams', 'AI-curious anyone'],
  },
  format: {
    heading: 'Format',
    items: ['Certificate included', 'Self-paced', 'Live webinars', 'Global access'],
  },
  image: '/images/about-banner.png',
} as const

// Journey section
export const JOURNEY = {
  badge: 'Your AI Amplify Journey',
  heading: 'Your AI Amplify Journey',
  subtext:
    'Six steps — everything you need to put AI to work and amplify your business.',
  items: [
    {
      title: 'AI Training Courses',
      description: 'Build future-ready AI skills in short, practical lessons.',
      image: '/images/redesign/journey-1-training.png',
    },
    {
      title: 'AI Mentors',
      description: 'Get 24/7 AI guidance to automate your workflows.',
      image: '/images/redesign/journey-2-mentors.png',
    },
    {
      title: 'AI Tools',
      description: 'Generate plans, content, and proposals in minutes.',
      image: '/images/redesign/journey-3-tools.png',
    },
    {
      title: 'Private Mentorship',
      description: 'Get personalized advice from verified human experts.',
      image: '/images/redesign/journey-4-private.png',
    },
    {
      title: 'SME Offers',
      description: 'Unlock exclusive discounts and tools from our partners.',
      image: '/images/redesign/journey-5-offers.png',
    },
    {
      title: 'Events',
      description: 'Learn live from AI and business experts, on demand or in person.',
      image: '/images/redesign/journey-6-events.png',
    },
  ],
  image: '/images/about-banner.png',
  ctaLabel: 'Login',
  ctaHref: '/login',
} as const

// Stakeholder section
export const STAKEHOLDER = {
  badge: 'Partner with AI Amplify',
  heading: 'Become an AI Amplify Partner',
  intro:
    'Run an SME or startup? Represent an organization that wants to bring AI Amplify to your community? Pick the track that fits — seats are limited.',
  cards: [
    {
      kind: 'expert',
      title: 'Experts Program',
      description:
        'Share your expertise as a mentor, coach, or lecturer and help SMEs put AI into practice.',
      ctaLabel: 'Join as an Expert',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-1-experts.png',
    },
    {
      kind: 'vc',
      title: 'VC Program',
      description:
        'Join as a VC, PE firm, bank, or financing partner to discover AI-ready businesses to fund.',
      ctaLabel: 'Join as a VC',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-2-vc.png',
    },
    {
      kind: 'government',
      title: 'Government Program',
      description:
        'Bring AI Amplify to your community as a multilateral or government partner.',
      ctaLabel: 'Join as a Government',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-3-government.png',
    },
    {
      kind: 'corporate',
      title: 'Corporate Program',
      description:
        'Sponsor the program or put your solutions in front of AI-ready businesses.',
      ctaLabel: 'Join as a Corporate',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-4-corporate.png',
    },
    {
      kind: 'university',
      title: 'University Program',
      description:
        'Join as a university or think tank to share faculty expertise and advance applied AI research.',
      ctaLabel: 'Join as a University',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-5-university.png',
    },
    {
      kind: 'incubator',
      title: 'Incubator Program',
      description:
        'Extend AI Amplify to your members as a chamber, incubator, co-working space, or NGO.',
      ctaLabel: 'Join as an Incubator',
      ctaHref: '#',
      image: '/images/redesign/stakeholder-6-incubator.png',
    },
  ],
} as const

export type StakeholderKind =
  | 'expert'
  | 'vc'
  | 'government'
  | 'corporate'
  | 'university'
  | 'incubator'

// Courses section — condensed to 3 tabs (also consumed by lib/dashboardData.ts to
// generate the dashboard course catalog — keep this structure stable).
export const COURSES = {
  badge: "The Entrepreneur's Journey",
  heading: "The Entrepreneur's Journey",
  categories: [
    {
      name: 'Transform with AI',
      modules: [
        {
          title: 'AI for Growth: The Practical SME Guide',
          units: [
            'The AI Opportunity for SMEs',
            'AI Readiness - Upskill Your Teams',
            'Augmented Intelligence - Chat-Based Tools',
            'Automating Business Processes with AI Agentic Tools',
            'Leveraging Local LLM and Hybrid Models',
            'Implementing AI in Your Business',
          ],
        },
      ],
    },
    {
      name: 'Digitize Your Business',
      modules: [
        {
          title: 'Evolving Your Business',
          units: [
            'Overview about the program',
            'Business Strategy',
            'Innovative offer to increase sales',
            'The online marketing campaign',
            'Project Management',
            'ICT setup',
            'Company financials',
            'Funding and Financing',
          ],
        },
        {
          title: 'Online Presence',
          units: [
            'Above the fold',
            'Conveying your credibility',
            'Your offering',
            'Selling Online',
            'Your branding',
          ],
        },
        {
          title: 'Digital Marketing',
          units: [
            'Marketing Plan',
            'Organizing your Marketing Department',
            'Digital Marketing Plan',
            '5 Key Marketing Metrics that Actually Matter',
            'Email Marketing Strategies',
            'Social Media Results',
            'Essential Search Engine Optimization Strategies',
            'Content Marketing Superiority',
            'Revenue Generation Models',
            '3 Quick Tips To Succeed with Inbound Marketing',
            '3 Tips on How to Run an Outbound Marketing Campaign',
            '3 Reasons on Why you Need to Podcast',
          ],
        },
        {
          title: 'Digital Content',
          units: [
            'Identifying your keywords and useful information',
            'Creating Social Media Posts',
            'Creating Videos',
            'Creating blog posts',
          ],
        },
      ],
    },
    {
      name: 'Additional Courses',
      modules: [
        {
          title: 'Cash Flow Management',
          units: ['Cash Flow Fundamentals', 'Managing Receivables', 'Cost Reduction Strategies'],
        },
        {
          title: 'Negotiation Skills',
          units: ['Negotiation Fundamentals', 'Winning Strategies', 'Real-world Scenarios'],
        },
        {
          title: 'Starting a Blog Online',
          units: [
            'Choosing your niche and platform',
            'Setting up your blog',
            'Writing your first posts',
            'Growing your audience',
          ],
        },
      ],
    },
  ],
} as const

// Landing-page-only display of "The Entrepreneur's Journey" — a flat list of 4
// courses shown on the marketing site. Kept separate from COURSES above, which
// feeds the dashboard's actual course catalog (lib/dashboardData.ts).
export const JOURNEY_COURSES = {
  badge: "The Entrepreneur's Journey",
  heading: "The Entrepreneur's Journey",
  subtext: 'A structured path from AI fundamentals to daily workflows — six courses to take you from curious to capable.',
  courses: [
    {
      title: 'AI Fundamentals',
      units: [
        'Introduction to AI',
        'Types of AI: Machine Learning',
        'Types of AI: Deep Learning',
        'Types of AI: Natural Language Processing',
        'Real-World Applications of AI',
        'AI Case Studies and Practical Usage',
      ],
    },
    {
      title: 'AI Ethics and Data Privacy',
      units: [
        'Understanding AI Ethics',
        'Addressing Bias in AI',
        'AI and Data Privacy Basics',
        'Ensuring Data Confidentiality',
        'Ethical Decision Making in AI',
        "AI's Impact on Society and Responsible AI Practices",
      ],
    },
    {
      title: 'Generative AI, LLMs and Diffusion Models',
      units: [
        'Introduction to Generative AI',
        'Language Models (LLMs)',
        'Diffusion Models',
        'LLMs for Text Generation',
        'LLMs and Diffusion Models for Image Generation',
        'Advanced Topics and Future Directions',
      ],
    },
    {
      title: 'AI in Daily Workflows',
      units: [
        'AI Integration in Everyday Tasks',
        'Enhancing Efficiency through AI',
        'AI in Decision-Making Processes',
        'AI-Driven Optimization Techniques',
        'AI and Personal Productivity',
        'Practical Examples and Use Cases',
      ],
    },
    {
      title: 'Prompt Engineering and AI Troubleshooting',
      units: [
        'Introduction to Prompt Engineering',
        'Common AI Issues and Challenges',
        'Troubleshooting AI Models',
        'Identifying and Handling Bias in Prompts',
        'When to Seek Help from AI Specialists',
        'Improving AI Performance and Reliability',
      ],
    },
    {
      title: "AI's Future and Continuous Learning",
      units: [
        'The Evolving Landscape of AI',
        'Latest Advances in AI Technologies',
        'Embracing Continuous Learning in AI',
        'Resources for Staying Up-to-Date with AI',
        "Ethical Considerations in AI's Future",
        "AI's Societal Impact and Future Opportunities",
      ],
    },
  ],
} as const

// AI Mentors — gif avatars from api.potential.com
export const AI_MENTORS = {
  badge: 'Your AI Coaches',
  heading: 'AI Mentors',
  subtext: 'Meet your always-on AI coaches — instant, expert guidance whenever your business needs it.',
  mentors: [
    {
      name: 'Corporate Security & Safety Coach',
      slug: 'corporate-security',
      botId: '64b78f8ea3495eade7931f1f',
      specialty: 'Risk Management',
      description: 'Expert guidance on corporate security policies and safety protocols.',
      avatar:
        'https://api.potential.com/static/mentors/1689755965063-Brown%20Neutral%20Minimalist%20Animated%20Self%20Care%20Instagram%20Post.gif',
    },
    {
      name: 'Enterprise Sales Coach',
      slug: 'sales-coach',
      botId: '64b7b59c2d7b52ec97f3a258',
      specialty: 'Sales Strategy',
      description: 'Strategies for scaling enterprise sales and closing high-value deals.',
      avatar: 'https://api.potential.com/static/mentors/1689761179954-Sales%20Coach.gif',
    },
    {
      name: 'Marketing Coach',
      slug: 'marketing-coach',
      botId: '64b7a7682d7b52ec97f3a21d',
      specialty: 'Marketing',
      description: 'Data-driven marketing strategies to grow your brand and customer base.',
      avatar: 'https://api.potential.com/static/mentors/1689757544593-Marketing%20Coach.gif',
    },
    {
      name: 'Legal Consultant',
      slug: 'legal-consultant',
      botId: '6540b46f64bed7823ecd4209',
      specialty: 'Legal',
      description: 'Navigate business legalities, contracts, and compliance requirements.',
      avatar:
        'https://api.potential.com/static/mentors/1698739311601-Potential.com%20AI%20Bots%20.jpg',
    },
    {
      name: 'Sustainability Bot',
      slug: 'sustainability-bot',
      botId: '64cb87a1293c2813e908395e',
      specialty: 'Sustainability',
      description: 'Integrate sustainable practices that reduce costs and boost reputation.',
      avatar:
        'https://api.potential.com/static/mentors/1691060123982-Brown%20Neutral%20Minimalist%20Animated%20Self%20Care%20Instagram%20Post.gif',
    },
    {
      name: 'Leadership Mentor',
      slug: 'leadership-mentor',
      botId: '64b79d632d7b52ec97f3a204',
      specialty: 'Leadership',
      description: 'Develop leadership skills to inspire teams and drive organizational growth.',
      avatar: 'https://api.potential.com/static/mentors/1689756174815-Leadership%20Coach.gif',
    },
  ],
  ctaLabel: 'Chat Now',
  ctaHref: '#',
} as const

// Chatbot Section
export const CHATBOT = {
  badge: 'AI Business Assistant',
  heading: 'Your AI Business Assistant',
  subtext:
    'Ask anything — Anna will draft a Business Plan, Business Idea, Product Proposal, or Marketing Plan tailored to your business, in minutes.',
  placeholder:
    'e.g. "Create a business plan for a sustainable clothing brand in Dubai"',
  capabilities: [
    'Business Plan Generator',
    'Business Idea Generator',
    'Product Proposal Tool',
    'Marketing Plan Creator',
  ],
} as const

// Human Mentors — real people from smeep.potential.org
export const HUMAN_MENTORS = {
  badge: 'Human Mentors',
  heading: 'Human Mentors',
  subtext: 'When you need a human touch, book a private 1:1 session with a verified business expert.',
  categories: ['All', 'Strategy', 'Marketing', 'Finance', 'Legal', 'Leadership', 'Operations'],
  // TODO: Update emails to match actual mentor user accounts in the DB
  mentors: [
    {
      name: 'Monika Papadopoulou',
      email: 'monika.papadopoulou@smeep.potential.org',
      specialty: 'Leadership, Sales, Branding',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/monika.jpg',
      linkedin: 'https://www.linkedin.com/in/monika-papadopoulou-26484191/',
      featured: true,
    },
    {
      name: 'Ziad Banna',
      email: 'ziad.banna@smeep.potential.org',
      specialty: 'Project Management, Leadership, Accounting',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ziadbanna.jpg',
      linkedin: 'https://www.linkedin.com/in/ziad-b-a7206b24/',
      featured: true,
    },
    {
      name: 'Celine Chami',
      email: 'celine.chami@smeep.potential.org',
      specialty: 'Social Media, Marketing, Communication',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Celine-card.jpg',
      linkedin: 'https://www.linkedin.com/in/celinechami',
      featured: true,
    },
    {
      name: 'Alla Musnicka',
      email: 'alla.musnicka@smeep.potential.org',
      specialty: 'Sales, Marketing, PR',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Alla-card.jpg',
      linkedin: 'https://www.linkedin.com/in/alla-marija-musnicka-21154224',
      featured: true,
    },
    {
      name: 'Ivan Kraemer',
      email: 'ivan.kraemer@smeep.potential.org',
      specialty: 'ICT, Sales, Team Building',
      category: 'Operations',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Ivan-Kraemer-smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/ivankraemer/',
      featured: true,
    },
    {
      name: 'Mita Srinivasan',
      email: 'mita.srinivasan@smeep.potential.org',
      specialty: 'PR, Social Media, Communications',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/06/Mita-Smeep-card.jpg',
      linkedin: 'https://www.linkedin.com/in/mitasrinivasan/',
      featured: true,
    },
    {
      name: 'Shahrazad Shehab',
      email: 'shahrazad.shehab@smeep.potential.org',
      specialty: 'PR, Social Media',
      category: 'Marketing',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/06/Shahrazad-Shehab-card-1.png',
      linkedin: 'https://www.linkedin.com/in/shahrazad-shehab/',
      featured: false,
    },
    {
      name: 'Sawsan Abbasy',
      email: 'sawsan.abbasy@smeep.potential.org',
      specialty: 'Strategy, Sales',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/05/Sawsan-Abbasy-300x300-1.png',
      linkedin: 'https://www.linkedin.com/in/sawsanabbasi/',
      featured: false,
    },
    {
      name: 'Umair Azhar',
      email: 'umair.azhar@smeep.potential.org',
      specialty: 'Insurance, Financials',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Umair.jpg',
      linkedin: 'https://www.linkedin.com/in/umair-azhar-b112117b/',
      featured: false,
    },
    {
      name: 'Ghinwa Abi Zeid',
      email: 'ghinwa.abizeid@smeep.potential.org',
      specialty: 'Legal, Partnerships, Company Setup',
      category: 'Legal',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/ghenwa.jpg',
      linkedin: 'https://www.linkedin.com/in/ghinwa-abi-zeid-7a129016/',
      featured: false,
    },
    {
      name: 'Albert Jose',
      email: 'albert.jose@smeep.potential.org',
      specialty: 'Accounting, Auditing, Tax',
      category: 'Finance',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2021/03/Albert-card.png',
      linkedin: 'https://www.linkedin.com/in/al-khazraji-audit-b08523168/',
      featured: false,
    },
    {
      name: 'Nika Sturm',
      email: 'nika.sturm@smeep.potential.org',
      specialty: 'Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Nika-Sturm.png',
      linkedin: 'https://www.linkedin.com/in/nikasturm/',
      featured: false,
    },
    {
      name: 'Ahmed Alsuleimani',
      email: 'ahmed.alsuleimani@smeep.potential.org',
      specialty: 'Leadership, Strategy',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/08/Ahmed-Alsuleimani.png',
      linkedin: 'https://www.linkedin.com/in/ahmed-alsuleimani-42a04066',
      featured: false,
    },
    {
      name: 'Samer Hamadeh',
      email: 'samer.hamadeh@smeep.potential.org',
      specialty: 'Product Development, Strategy, Business Development',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Samer-card.jpg',
      linkedin: 'https://www.linkedin.com/in/samerhamadeh/',
      featured: false,
    },
    {
      name: 'Kirsten Westholter',
      email: 'kirsten.westholter@smeep.potential.org',
      specialty: 'Design Thinking, Business Transformation, Strategy',
      category: 'Strategy',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Kirsten-card.jpg',
      linkedin: 'https://www.linkedin.com/in/kirstenwestholter/',
      featured: false,
    },
    {
      name: 'Tony Feghali',
      email: 'tony.feghali@smeep.potential.org',
      specialty: 'Strategy, Leadership, Sales',
      category: 'Leadership',
      avatar: 'https://smeep.potential.org/wp-content/uploads/2020/07/Tony-card.jpg',
      linkedin: 'https://www.linkedin.com/in/tonyfeghali/',
      featured: false,
    },
    {
      name: 'Lara Haddad',
      email: 'lara.haddad@smeep.potential.org',
      specialty: 'Strategy & Operations',
      category: 'Strategy',
      avatar: '/assets/mentors/mentor-placeholder.jpg',
      linkedin: 'https://www.linkedin.com/in/lara-haddad/',
      featured: false,
    },
  ],
  ctaLabel: 'Book Session',
  ctaHref: '#',
} as const

// Special Offers — section-level copy only; offer data comes from the API
export const SPECIAL_OFFERS = {
  badge: 'Partner Offers',
  heading: 'Special AI Amplify Offers',
  subtext: 'Exclusive discounts and tools from our partners — one more way AI Amplify pays for itself.',
  ctaLabel: 'Reveal Coupon',
  ctaHref: '#',
} as const

// Community section
export const COMMUNITY = {
  badge: 'Meet Our Community',
  heading: 'Meet Our Community',
  subtext:
    "Since 2010, this program has reached over 300,000 SMEs across 50+ countries. Now it's amplified with AI — and we're eager to share your story and expertise with the community.",
  stats: [
    { value: 300000, label: 'SMEs Reached', display: '300,000+', animate: true },
    { value: 2010, label: 'Year Founded', display: 'Since 2010', animate: false },
    { value: 50, label: 'Countries', display: '50+', animate: true },
  ],
  image: '/images/community-map.png',
} as const

// CTA Final
export const CTA_FINAL = {
  heading: 'Cut Costs and Grow Faster with AI',
  subtext: 'Seats are limited. Join thousands of SMEs already amplifying their business with AI.',
  loginLabel: 'Login',
  loginHref: '/login',
} as const

// Centralized redesign asset paths + alt text
export const REDESIGN_ASSETS = {
  hero: { src: '/images/redesign/hero.png', alt: 'AI-empowered SME workspace' },
  heroBg: {
    src: '/images/redesign/hero-bg.png',
    alt: '',
  },
  aboutPhoto: { src: '/images/redesign/about-photo.png', alt: 'SME owner working with AI tools' },
  journeyFlow: {
    src: '/images/redesign/journey-flow-image.png',
    alt: 'AI-powered journey flow diagram',
  },
  additionalResources: {
    src: '/images/redesign/additional-resources.png',
    alt: 'Additional resources from AWS, Cisco, Potential and Schneider Electric',
  },
  worldMap: { src: '/images/redesign/world-map.png', alt: 'Global community map' },
  chatbotOrb: { src: '/images/redesign/chatbot-orb.png', alt: 'AI assistant orb avatar' },
  logo: { src: '/images/redesign/potential-logo.png', alt: 'Potential' },
  annaAvatar96: { src: '/images/redesign/anna-avatar-96.png', alt: 'Anna, your AI Business Assistant' },
  annaAvatar200: { src: '/images/redesign/anna-avatar-200.png', alt: 'Anna, your AI Business Assistant' },
  ctaFinalBg: { src: '/images/redesign/cta-final-bg.png', alt: '' },
  authVisual: { src: '/images/redesign/auth-visual.png', alt: '' },
} as const

// Testimonials
export const TESTIMONIALS = [
  {
    quote:
      'This AI Marketing Plan tool is a remarkable solution, efficiently producing all my marketing materials tailored to our product, streamlining our promotional efforts.',
    name: 'Andrea',
    role: 'Marketing Manager, UK Startup',
    rating: 5,
  },
  {
    quote:
      'This AI Press Release generator revolutionizes the PR process, making it incredibly fast and user-friendly for anyone seeking to create impactful press releases effortlessly.',
    name: 'Hana',
    role: 'MarCom, Japanese Keiretsu',
    rating: 5,
  },
  {
    quote:
      'The AI Career Counselor is a game-changer, providing students personalized and insightful career guidance tailored to their interests and strengths.',
    name: 'Méchèle',
    role: 'University Professor in UAE',
    rating: 5,
  },
] as const

// Newsletter
export const NEWSLETTER = {
  heading: 'Stay in the loop',
  body: 'Monthly AI playbooks, partner offers, and live event invites — straight to your inbox.',
  placeholder: 'you@example.com',
  ctaLabel: 'Subscribe',
} as const

// Footer
export const FOOTER = {
  contactEmail: 'info@potential.com',
  copyright: 'Potential © 2005-2026 | All Rights Reserved.',
  contactHeading: 'Get in Touch',
  contactBody: 'For any inquiries about AI Amplify, please contact us at:',
} as const
