export const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
  { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷', native: 'Português' },
  { code: 'sw', name: 'Swahili', flag: '🇰🇪', native: 'Kiswahili' },
  { code: 'ha', name: 'Hausa', flag: '🇳🇬', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', flag: '🇳🇬', native: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', flag: '🇳🇬', native: 'Igbo' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
  { code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
]

export const DEFAULT_LANGUAGE = 'en'

export const getLanguage = (code) =>
  LANGUAGES.find(l => l.code === code) || LANGUAGES[0]