import { supabase } from '../supabase'
import { sendPushToUser } from './pushNotifications'
import { trackGigReferral } from './referral'

export const findExistingApplication = async (gigId, workerId) => {
  const { data, error } = await supabase
    .from('applications')
    .select('id, status')
    .eq('gig_id', gigId)
    .eq('worker_id', workerId)
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}

export const findApplicationBlocker = async (workerId) => {
  const { data: userStatus, error: statusError } = await supabase
    .from('users')
    .select('account_status')
    .eq('id', workerId)
    .maybeSingle()

  if (statusError) throw statusError

  if (userStatus?.account_status === 'restricted') {
    return 'Your account is restricted because of unpaid platform commission. Please pay your owed commission to apply for gigs again.'
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: overdueCommissions, error: commissionsError } = await supabase
    .from('commissions')
    .select('id')
    .eq('worker_id', workerId)
    .eq('status', 'pending')
    .or(`due_date.lte.${new Date().toISOString()},and(due_date.is.null,created_at.lte.${threeDaysAgo})`)
    .limit(1)

  if (commissionsError) throw commissionsError

  if (overdueCommissions?.length > 0) {
    return 'You have unpaid platform commission older than 3 days. Please pay it on the Commission page before applying for another gig.'
  }

  return null
}

export const ensureGigConversation = async ({ gigId, posterId, workerId }) => {
  const { data: existingConvos, error: lookupError } = await supabase
    .from('conversations')
    .select('id')
    .eq('gig_id', gigId)
    .or(
      `and(participant_1.eq.${posterId},participant_2.eq.${workerId}),` +
      `and(participant_1.eq.${workerId},participant_2.eq.${posterId})`
    )
    .limit(1)

  if (lookupError) throw lookupError
  if (existingConvos?.[0]) return existingConvos[0]

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      gig_id: gigId,
      participant_1: posterId,
      participant_2: workerId,
      last_message: 'Application sent',
      last_message_at: new Date().toISOString()
    })
    .select('id')
    .single()

  if (createError) throw createError
  return created
}

export const applyToGig = async ({ gig, workerId, notifyPush = true }) => {
  const existing = await findExistingApplication(gig.id, workerId)
  if (existing) return { alreadyApplied: true, application: existing }

  const blocker = await findApplicationBlocker(workerId)
  if (blocker) return { blocked: true, message: blocker }

  const { data: application, error } = await supabase
    .from('applications')
    .insert({
      gig_id: gig.id,
      worker_id: workerId,
      status: 'pending'
    })
    .select('id, status')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { alreadyApplied: true }
    }
    throw error
  }

  await supabase.from('notifications').insert({
    user_id: gig.poster_id,
    title: 'New Application!',
    message: `Someone applied for your gig "${gig.title}"`,
    type: 'application',
    gig_id: gig.id
  })

  if (notifyPush) {
    await sendPushToUser(
      gig.poster_id,
      'New Application!',
      `Someone applied for your gig "${gig.title}"`,
      { type: 'application', gigId: gig.id }
    )
  }

  await ensureGigConversation({
    gigId: gig.id,
    posterId: gig.poster_id,
    workerId
  })

  await trackGigReferral(gig.id, workerId)
  return { alreadyApplied: false, application }
}
