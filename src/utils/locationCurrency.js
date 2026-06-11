const COUNTRY_CURRENCY = [
  { match: ['nigeria', 'lagos', 'abuja'], code: 'NGN' },
  { match: ['ghana'], code: 'GHS' },
  { match: ['kenya'], code: 'KES' },
  { match: ['south africa'], code: 'ZAR' },
  { match: ['tanzania'], code: 'TZS' },
  { match: ['egypt'], code: 'EGP' },
  { match: ['india'], code: 'INR' },
  { match: ['brazil'], code: 'BRL' },
  { match: ['mexico'], code: 'MXN' },
  { match: ['japan'], code: 'JPY' },
  { match: ['china'], code: 'CNY' },
  { match: ['united kingdom', 'uk', 'england', 'scotland', 'wales'], code: 'GBP' },
  { match: ['canada'], code: 'CAD' },
  { match: ['australia'], code: 'AUD' },
  { match: ['united arab emirates', 'uae', 'dubai'], code: 'AED' },
  { match: ['saudi arabia'], code: 'SAR' },
  { match: ['france', 'germany', 'spain', 'italy', 'netherlands', 'ireland'], code: 'EUR' },
]

export const currencyForLocation = (location, fallback = 'USD') => {
  const text = String(location || '').toLowerCase()
  const found = COUNTRY_CURRENCY.find(({ match }) =>
    match.some(part => text.includes(part))
  )
  return found?.code || fallback || 'USD'
}

export const currencyOptionsForLocation = (location, fallback = 'USD') => {
  const localCurrency = currencyForLocation(location, fallback)
  return localCurrency === 'USD' ? ['USD'] : [localCurrency, 'USD']
}
