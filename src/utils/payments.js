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
