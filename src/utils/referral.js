import { supabase } from '../supabase'

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

    // Reward referrer — +5 trust score + 20 credits
    throwIfSupabaseError(await supabase.rpc('increment_trust', {
      user_id: referral.referrer_id,
      amount: 5
    }))

    throwIfSupabaseError(await supabase.rpc('add_credits', {
      p_user_id: referral.referrer_id,
      p_amount: 20,
      p_type: 'referral_reward',
      p_description: `Referral reward — ${referral.referrer?.full_name || 'Someone'} joined Prima`,
    }))

    // Reward new user — +3 trust score + 10 credits
    throwIfSupabaseError(await supabase.rpc('increment_trust', {
      user_id: userId,
      amount: 3
    }))

    throwIfSupabaseError(await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: 10,
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
      message: `Your referral completed their profile! You earned +5 trust score and 20 Prima Credits.`,
      type: 'general'
    })

    // Notify new user
    await supabase.from('notifications').insert({
      user_id: userId,
      title: '🎁 Welcome Bonus!',
      message: 'You joined via referral and earned +3 trust score and 10 Prima Credits!',
      type: 'general'
    })

    console.log('Referral completed and rewards given')
  } catch (e) {
    console.error('Complete referral error:', e)
  }
}

// Generate referral code for new user
export const generateReferralCode = async (userId, username, fullName) => {
  const base = (username || fullName || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 8)
  const code = base + Math.floor(1000 + Math.random() * 9000)

  await supabase
    .from('users')
    .update({ referral_code: code })
    .eq('id', userId)

  return code
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

export const rewardGigReferral = async (gigId, gigAmount) => {
  try {
    const { data: referral } = await supabase
      .from('gig_referrals')
      .select('*, referrer:users!gig_referrals_referrer_id_fkey(full_name)')
      .eq('gig_id', gigId)
      .eq('status', 'pending')
      .eq('reward_given', false)
      .maybeSingle()

    if (!referral) return

    const rewardDollars = gigAmount * 0.05
    const rewardCredits = Math.round(rewardDollars * 50)
    if (rewardCredits < 1) return

    await supabase.rpc('add_credits', {
      p_user_id: referral.referrer_id,
      p_amount: rewardCredits,
      p_type: 'gig_referral',
      p_description: `5% gig referral reward`,
      p_gig_id: gigId
    })

    await supabase
      .from('gig_referrals')
      .update({
        status: 'completed',
        reward_given: true,
        gig_amount: gigAmount,
        reward_credits: rewardCredits,
        completed_at: new Date().toISOString()
      })
      .eq('id', referral.id)

    await supabase.from('notifications').insert({
      user_id: referral.referrer_id,
      title: '🎉 Gig Referral Reward!',
      message: `You earned ${rewardCredits} Prima Credits (5% of $${gigAmount}) for referring a gig!`,
      type: 'general',
      gig_id: gigId
    })

    console.log('Gig referral rewarded:', rewardCredits, 'credits')
  } catch (e) {
    console.error('Reward gig referral error:', e)
  }
}
