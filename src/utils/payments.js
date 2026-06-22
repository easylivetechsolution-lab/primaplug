export const COMMISSION_RATE = 0.10
export const WORKER_ESCROW_SHARE = 1 - COMMISSION_RATE
export const CREDITS_PER_DOLLAR = 50
export const MIN_WITHDRAWAL_CREDITS = 500

export const PAYMENT_METHODS = {
  MANUAL: 'manual',
  WALLET: 'wallet',
}

export const calculateCommission = (amount) =>
  Number(amount || 0) * COMMISSION_RATE

export const calculateWorkerEscrowShare = (amount) =>
  Number(amount || 0) * WORKER_ESCROW_SHARE

export const creditsToDollars = (credits) =>
  Number(credits || 0) / CREDITS_PER_DOLLAR

export const dollarsToCredits = (dollars) =>
  Math.ceil(Number(dollars || 0) * CREDITS_PER_DOLLAR)

// Approximate conversion rates to USD — update periodically.
// Used only for commission display/credits calculation, not real payouts
// (real payouts always happen in the original currency via Fincra).
export const USD_CONVERSION_RATES = {
  USD: 1,
  NGN: 1 / 1600,   // ~₦1,600 = $1
  GHS: 1 / 15,     // ~15 GHS = $1
  KES: 1 / 130,    // ~130 KES = $1
  UGX: 1 / 3700,   // ~3700 UGX = $1
  ZAR: 1 / 18,     // ~18 ZAR = $1
  GBP: 1.27,
  EUR: 1.08,
}

export const convertToUSD = (amount, currency) => {
  const rate = USD_CONVERSION_RATES[currency] ?? 1
  return Number(amount || 0) * rate
}
