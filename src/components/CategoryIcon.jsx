import {
  BriefcaseBusiness,
  GraduationCap,
  HeartPulse,
  House,
  Laptop,
  Palette,
  PartyPopper,
  Sparkles,
  Truck,
  Wrench,
} from 'lucide-react'

const ICONS = {
  'Technology & Digital': Laptop,
  'Creative & Media': Palette,
  'Business & Finance': BriefcaseBusiness,
  'Education & Coaching': GraduationCap,
  'Trades & Technical': Wrench,
  'Home & Personal Services': House,
  'Health & Wellness': HeartPulse,
  'Events & Hospitality': PartyPopper,
  'Logistics & Transport': Truck,
  Other: Sparkles,
}

export default function CategoryIcon({
  category,
  size = 18,
  color = 'currentColor',
  strokeWidth = 1.8,
}) {
  const Icon = ICONS[category] || Sparkles
  return <Icon size={size} color={color} strokeWidth={strokeWidth} aria-hidden="true" style={{ flexShrink: 0 }} />
}
