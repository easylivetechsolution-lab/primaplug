import { supabase } from '../supabase'

export const REFERRAL_REWARDS = {
  referrerTrust: 2,
  referrerCredits: 5,
  referredCredits: 5,
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
export const processReferral = async () => {
  const referralCode = localStorage.getItem('prima_referral')
  if (!referralCode) return

  try {
    const { error } = await supabase.rpc('record_signup_referral', {
      p_referral_code: referralCode
    })
    if (error) throw error
    localStorage.removeItem('prima_referral')
  } catch (e) {
    console.error('Referral error:', e)
  }
}

// Complete referral when new user finishes profile
export const completeReferral = async () => {
  try {
    const { data, error } = await supabase.rpc('complete_signup_referral')
    if (error) throw error
    return data?.status
  } catch (e) {
    console.error('Complete referral error:', e)
    return null
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

      const { data, error: codeError } = await supabase.rpc('set_my_referral_code', {
        p_code: code
      })

      if (!codeError && data?.referral_code) {
        console.log('Referral code ready:', data.referral_code)
        return data.referral_code
      }

      if (data?.status === 'collision') continue
      if (codeError) {
        console.error('Referral code update error:', codeError)
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

export const trackGigReferral = async (gigId) => {
  const captured = getCapturedGigReferral()
  if (!captured) return
  if (captured.gigId !== gigId) return

  try {
    const { error } = await supabase.rpc('record_gig_referral', {
      p_gig_id: gigId,
      p_referral_code: captured.referralCode
    })
    if (error) throw error

    clearGigReferral()
    console.log('Gig referral tracked')
  } catch (e) {
    console.error('Track gig referral error:', e)
  }
}

// Check if a gig has an active, unpaid referral attached to it —
// used to notify the worker at acceptance time
export const getPendingGigReferralForPayout = async (gigId, workerId) => {
  try {
    let query = supabase
      .from('gig_referrals')
      .select('*')
      .eq('gig_id', gigId)
      .eq('status', 'pending')
      .eq('reward_given', false)

    // Filter by accepted worker so we reward the right referrer when multiple
    // workers applied via different referral links for the same gig.
    if (workerId) query = query.eq('referred_id', workerId)

    const { data: referral } = await query.maybeSingle()
    return referral || null
  } catch (e) {
    console.error('getPendingGigReferralForPayout error:', e)
    return null
  }
}
