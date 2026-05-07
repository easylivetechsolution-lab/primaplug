export const CATEGORIES = [
  {
    group: 'Technology & Digital',
    icon: '💻',
    color: '#6C47FF',
    bg: '#EEE9FF',
    border: '#B8A5FF',
    fields: [
      'Software Development',
      'Web Design & UI/UX',
      'Mobile Apps',
      'IT Support & Networks',
      'Cybersecurity',
      'Data & Analytics',
      'AI & Automation',
      'DevOps & Cloud',
    ]
  },
  {
    group: 'Creative & Media',
    icon: '🎨',
    color: '#FF4DCF',
    bg: '#FFE8FA',
    border: '#FF99E8',
    fields: [
      'Graphic Design',
      'Video Production & Editing',
      'Photography',
      'Animation & Motion Graphics',
      'Music & Audio',
      'Illustration & Art',
      'Content Creation',
      'Copywriting & Editing',
    ]
  },
  {
    group: 'Business & Finance',
    icon: '💼',
    color: '#0EA5E9',
    bg: '#E0F2FE',
    border: '#7DD3FC',
    fields: [
      'Accounting & Bookkeeping',
      'Business Consulting',
      'Legal Services',
      'Financial Planning',
      'Project Management',
      'Virtual Assistant',
      'Customer Support',
      'Sales & Marketing',
    ]
  },
  {
    group: 'Education & Coaching',
    icon: '📚',
    color: '#00C48C',
    bg: '#DFFDF4',
    border: '#7EECD2',
    fields: [
      'Tutoring & Teaching',
      'Language Lessons',
      'Career Coaching',
      'Life Coaching',
      'Sports Coaching',
      'Skills Training',
    ]
  },
  {
    group: 'Trades & Technical',
    icon: '🔧',
    color: '#FF6B2B',
    bg: '#FFF0E8',
    border: '#FFBC99',
    fields: [
      'Electrical Work',
      'Plumbing',
      'Carpentry & Woodwork',
      'Construction & Building',
      'HVAC & Air Conditioning',
      'Solar & Renewable Energy',
      'Welding & Fabrication',
      'Auto Mechanics',
    ]
  },
  {
    group: 'Home & Personal Services',
    icon: '🏠',
    color: '#FFB800',
    bg: '#FFF8E0',
    border: '#FFD966',
    fields: [
      'Cleaning & Housekeeping',
      'Moving & Relocation',
      'Handyman & Repairs',
      'Interior Design',
      'Landscaping & Gardening',
      'Pest Control',
      'Security Services',
      'Personal Shopping',
    ]
  },
  {
    group: 'Health & Wellness',
    icon: '❤️',
    color: '#FF3366',
    bg: '#FFE8EE',
    border: '#FF99B3',
    fields: [
      'Nursing & Healthcare',
      'Physiotherapy',
      'Personal Training',
      'Nutrition & Dietetics',
      'Mental Health Support',
      'Massage Therapy',
      'Beauty & Makeup',
      'Barbering & Hair',
    ]
  },
  {
    group: 'Events & Hospitality',
    icon: '🎪',
    color: '#9B59FF',
    bg: '#F3EEFF',
    border: '#C9AAFF',
    fields: [
      'Event Planning',
      'Catering & Cooking',
      'DJ & Entertainment',
      'MC & Public Speaking',
      'Waitering & Service',
      'Photography & Filming',
    ]
  },
  {
    group: 'Logistics & Transport',
    icon: '🚚',
    color: '#14B8A6',
    bg: '#CCFBF1',
    border: '#5EEAD4',
    fields: [
      'Delivery & Courier',
      'Driving Services',
      'Freight & Haulage',
      'Errand Running',
      'Warehousing',
    ]
  },
  {
    group: 'Other',
    icon: '✦',
    color: '#8B8FAF',
    bg: '#F5F4FF',
    border: '#E2E0FF',
    fields: ['Other — describe below']
  }
]

// Flat list of all fields for backward compatibility
export const ALL_FIELDS = CATEGORIES.flatMap(c => c.fields)

// Get group for a field
export const getGroupForField = (field) => {
  const cat = CATEGORIES.find(c => c.fields.includes(field))
  return cat || CATEGORIES[CATEGORIES.length - 1]
}