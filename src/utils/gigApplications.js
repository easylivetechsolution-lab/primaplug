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

