import { supabase } from '../supabase'

export const REFERRAL_REWARDS = {
  referrerTrust: 3,
  referrerCredits: 20,
  referredTrust: 3,
  referredCredits: 10,
}

const throwIfSupabaseError = ({ error }) => {
  if (error) throw error
}

// Save referral code from URL to localStorage
export const captureReferralCode = () => {
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref) {
    localStorage.setItem('prima_referral', ref)
    console.log('Referral code captured:', ref)
  }
}

// Process referral after signup
export const processReferral = async (newUserId) => {
  const referralCode = localStorage.getItem('prima_referral')
  if (!referralCode) return

  try {
    // Find referrer by code
    const { data: referrer } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('referral_code', referralCode)
      .maybeSingle()

    if (!referrer || referrer.id === newUserId) return

    // Check if referral already exists
    const { data: existing } = await supabase
      .from('referrals')
      .select('id')
      .eq('referred_id', newUserId)
      .maybeSingle()

    if (existing) return

    // Create referral record
    await supabase.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
      referral_code: referralCode,
      status: 'pending'
    })

    console.log('Referral created for:', referrer.full_name)
    localStorage.removeItem('prima_referral')
  } catch (e) {
    console.error('Referral error:', e)
  }
}

// Complete referral when new user finishes profile
export const completeReferral = async (userId) => {
  try {
    // Find pending referral for this user
    const { data: referral } = await supabase
      .from('referrals')
      .select('*, referrer:users!referrals_referrer_id_fkey(id, full_name)')
      .eq('referred_id', userId)
      .eq('status', 'pending')
      .eq('reward_given', false)
      .maybeSingle()

    if (!referral) return

    // Reward referrer
    throwIfSupabaseError(await supabase.rpc('increment_trust', {
      user_id: referral.referrer_id,
      amount: REFERRAL_REWARDS.referrerTrust
    }))

    throwIfSupabaseError(await supabase.rpc('add_credits', {
      p_user_id: referral.referrer_id,
      p_amount: REFERRAL_REWARDS.referrerCredits,
      p_type: 'referral_reward',
      p_description: `Referral reward — ${referral.referrer?.full_name || 'Someone'} joined Prima`,
    }))

    // Reward new user
    throwIfSupabaseError(await supabase.rpc('increment_trust', {
      user_id: userId,
      amount: REFERRAL_REWARDS.referredTrust
    }))

    throwIfSupabaseError(await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: REFERRAL_REWARDS.referredCredits,
      p_type: 'referral_joined',
      p_description: 'Welcome bonus for joining via referral',
    }))

    // Mark referral complete only after rewards have succeeded.
    throwIfSupabaseError(await supabase
      .from('referrals')
      .update({
        status: 'completed',
        reward_given: true,
        completed_at: new Date().toISOString()
      })
      .eq('id', referral.id))

    // Notify referrer
    await supabase.from('notifications').insert({
      user_id: referral.referrer_id,
      title: '🎉 Referral Completed!',
      message: `Your referral completed their profile! You earned +${REFERRAL_REWARDS.referrerTrust} trust score and ${REFERRAL_REWARDS.referrerCredits} Prima Credits.`,
      type: 'general'
    })

    // Notify new user
    await supabase.from('notifications').insert({
      user_id: userId,
      title: '🎁 Welcome Bonus!',
      message: `You joined via referral and earned +${REFERRAL_REWARDS.referredTrust} trust score and ${REFERRAL_REWARDS.referredCredits} Prima Credits!`,
      type: 'general'
    })

    console.log('Referral completed and rewards given')
  } catch (e) {
    console.error('Complete referral error:', e)
  }
}

// Generate referral code for new user
export const generateReferralCode = async (userId, username, fullName) => {
  try {
    // Check if user already has a code
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle()

    if (fetchError) {
      console.error('Referral code fetch error:', fetchError)
      return null
    }

    if (existing?.referral_code) {
      console.log('User already has referral code:', existing.referral_code)
      return existing.referral_code
    }

    const base = (username || fullName || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 8) || 'user'

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = base + Math.floor(1000 + Math.random() * 9000)

      const { data: updated, error: updateError } = await supabase
        .from('users')
        .update({ referral_code: code })
        .eq('id', userId)
        .select('referral_code')
        .maybeSingle()

      if (!updateError && updated?.referral_code) {
        console.log('Referral code generated:', code)
        return code
      }

      if (updateError?.code !== '23505') {
        console.error('Referral code update error:', updateError)
        return null
      }
    }

    console.error('Referral code generation failed after multiple attempts')
    return null

  } catch (e) {
    console.error('generateReferralCode error:', e)
    return null
  }
}

// Capture gig referral from URL
export const captureGigReferral = () => {
  const params = new URLSearchParams(window.location.search)
  const gigRef = params.get('gigref')
  const ref = params.get('ref')
  if (gigRef && ref) {
    localStorage.setItem('prima_gig_referral', JSON.stringify({ gigId: gigRef, referralCode: ref }))
    console.log('Gig referral captured:', gigRef, ref)
    return { gigId: gigRef, referralCode: ref }
  }
  return null
}

export const getCapturedGigReferral = () => {
  try {
    const data = localStorage.getItem('prima_gig_referral')
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export const clearGigReferral = () => {
  localStorage.removeItem('prima_gig_referral')
}

export const trackGigReferral = async (gigId, referredUserId) => {
  const captured = getCapturedGigReferral()
  if (!captured) return
  if (captured.gigId !== gigId) return

  try {
    const { data: referrer } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', captured.referralCode)
      .maybeSingle()

    if (!referrer) return
    if (referrer.id === referredUserId) return

    const { data: existing } = await supabase
      .from('gig_referrals')
      .select('id')
      .eq('gig_id', gigId)
      .eq('referred_id', referredUserId)
      .maybeSingle()

    if (existing) return

    await supabase.from('gig_referrals').insert({
      gig_id: gigId,
      referrer_id: referrer.id,
      referred_id: referredUserId,
      status: 'pending'
    })

    clearGigReferral()
    console.log('Gig referral tracked')
  } catch (e) {
    console.error('Track gig referral error:', e)
  }
}

// Check if a gig has an active, unpaid referral attached to it —
// used to notify the worker at acceptance time
export const getPendingGigReferralForPayout = async (gigId) => {
  try {
    const { data: referral } = await supabase
      .from('gig_referrals')
      .select('*')
      .eq('gig_id', gigId)
      .eq('status', 'pending')
      .eq('reward_given', false)
      .maybeSingle()

    return referral || null
  } catch (e) {
    console.error('getPendingGigReferralForPayout error:', e)
    return null
  }
}

// Pays the referrer 5% of the gig's REAL payment amount as actual
// currency into their wallet_balance — NOT Prima Credits. Called
// from ReceiptFlow.jsx for both wallet and manual gig completions.
export const rewardGigReferral = async (gigId, gigAmount, currency) => {
  try {
    const { data: referral } = await supabase
      .from('gig_referrals')
      .select('*, referrer:users!gig_referrals_referrer_id_fkey(full_name)')
      .eq('gig_id', gigId)
      .eq('status', 'pending')
      .eq('reward_given', false)
      .maybeSingle()

    if (!referral) return

    const referrerShare = gigAmount * 0.05
    if (referrerShare <= 0) return

    const { data: referrerRow } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', referral.referrer_id)
      .single()

    const newBalance = Number(referrerRow?.wallet_balance || 0) + referrerShare

    await supabase
      .from('users')
      .update({ wallet_balance: newBalance })
      .eq('id', referral.referrer_id)

    await supabase.from('wallet_transactions').insert({
      user_id: referral.referrer_id,
      gig_id: gigId,
      type: 'gig_referral_payout',
      amount: referrerShare,
      currency: currency || 'NGN',
      balance_after: newBalance,
      status: 'completed',
      description: 'Gig referral reward — 5% of gig payment',
    })

    await supabase
      .from('gig_referrals')
      .update({
        status: 'completed',
        reward_given: true,
        gig_amount: gigAmount,
        reward_amount: referrerShare,
        reward_currency: currency,
        completed_at: new Date().toISOString()
      })
      .eq('id', referral.id)

    await supabase.from('notifications').insert({
      user_id: referral.referrer_id,
      title: '🎉 Gig Referral Reward!',
      message: `You earned ${currency || 'NGN'} ${referrerShare.toLocaleString()} (5% of the gig payment) for referring this gig!`,
      type: 'wallet',
      gig_id: gigId
    })

    console.log('Gig referral rewarded (real money):', referrerShare, currency)
  } catch (e) {
    console.error('Reward gig referral error:', e)
  }
}
