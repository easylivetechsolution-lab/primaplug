import { supabase } from '../supabase'

export const CONVERSATION_SELECT = `
  *,
  gigs(id, title, pay_min, pay_max, status),
  p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
  p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
`

export const CHAT_MESSAGE_LIMIT = 50

export const parseTimestamp = (value) => {
  if (!value) return new Date()
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) {
    return new Date(value + 'Z')
  }
  return new Date(value)
}

export const getOtherUser = (convo, userId) => {
  if (!convo || !userId) return null
  return convo.participant_1 === userId ? convo.p2 : convo.p1
}

export const getUnreadCount = (convo, userId) => {
  if (!convo || !userId) return 0
  return convo.participant_1 === userId
    ? convo.unread_count_1 || 0
    : convo.unread_count_2 || 0
}

export const getClearTimestamp = (convo, userId) => {
  if (!convo || !userId) return null
  return convo.participant_1 === userId ? convo.cleared_at_1 : convo.cleared_at_2
}

const visibleToUser = (convo, userId) => {
  if (!convo || !userId) return false
  return !(convo.hidden_for || []).includes(userId)
}

export const fetchConversations = async (userId, { includeEmpty = false } = {}) => {
  if (!userId) return []
  let query = supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
    .order('last_message_at', { ascending: false })

  if (!includeEmpty) query = query.neq('last_message', '')

  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(convo => visibleToUser(convo, userId))
}

export const fetchConversationById = async (convoId, userId) => {
  if (!convoId || !userId) return null
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', convoId)
    .single()

  if (error) throw error
  return visibleToUser(data, userId) ? data : null
}

export const findConversationWithUser = async ({ currentUserId, targetUserId, gigId = null }) => {
  if (!currentUserId || !targetUserId) return null
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(
      `and(participant_1.eq.${currentUserId},participant_2.eq.${targetUserId}),` +
      `and(participant_1.eq.${targetUserId},participant_2.eq.${currentUserId})`
    )
    .order('last_message_at', { ascending: false })
    .limit(20)

  if (error) throw error
  const visible = (data || []).filter(convo => visibleToUser(convo, currentUserId))
  return visible.find(convo => gigId ? convo.gig_id === gigId : !convo.gig_id) || visible[0] || null
}

export const createDraftConversation = async ({ currentUser, targetUserId, gigId = null }) => {
  const { data: targetUser } = await supabase
    .from('users')
    .select('id, full_name, avatar_url, trust_score')
    .eq('id', targetUserId)
    .single()

  const { data: gig } = gigId
    ? await supabase
      .from('gigs')
      .select('id, title, pay_min, pay_max, status')
      .eq('id', gigId)
      .single()
    : { data: null }

  return {
    id: null,
    gig_id: gigId || null,
    participant_1: currentUser.id,
    participant_2: targetUserId,
    p1: { id: currentUser.id, full_name: currentUser.email?.split('@')[0] || 'You' },
    p2: targetUser || { id: targetUserId, full_name: 'User' },
    gigs: gig,
    last_message: '',
    last_message_at: new Date().toISOString(),
    unread_count_1: 0,
    unread_count_2: 0,
    hidden_for: []
  }
}

export const createConversation = async ({ currentUserId, targetUserId, gigId = null }) => {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      gig_id: gigId || null,
      participant_1: currentUserId,
      participant_2: targetUserId,
      last_message: '',
      last_message_at: new Date().toISOString()
    })
    .select(CONVERSATION_SELECT)
    .single()

  if (error) throw error
  return data
}

export const getOrCreateConversation = async ({ currentUser, targetUserId, gigId = null, create = false }) => {
  const existing = await findConversationWithUser({
    currentUserId: currentUser.id,
    targetUserId,
    gigId
  })
  if (existing) return existing
  if (create) {
    return createConversation({
      currentUserId: currentUser.id,
      targetUserId,
      gigId
    })
  }
  return createDraftConversation({ currentUser, targetUserId, gigId })
}

export const fetchMessages = async (convo, userId, { limit = CHAT_MESSAGE_LIMIT } = {}) => {
  if (!convo?.id) return []
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  const clearedAt = getClearTimestamp(convo, userId)
  if (clearedAt) query = query.gt('created_at', clearedAt)

  const { data, error } = await query
  if (error) throw error
  return (data || []).reverse()
}

export const markConversationRead = async (convo, userId) => {
  if (!convo?.id || !userId) return
  const isP1 = convo.participant_1 === userId
  const { error } = await supabase
    .from('conversations')
    .update(isP1 ? { unread_count_1: 0 } : { unread_count_2: 0 })
    .eq('id', convo.id)

  if (error) throw error
}

export const markMessageRead = async (messageId) => {
  if (!messageId) return
  const { error } = await supabase
    .from('messages')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) throw error
}

export const sendMessage = async ({ user, conversation, content, replyTo = null, notifyPush = false, sendPushToUser = null }) => {
  const text = content.trim()
  if (!text || !conversation || !user?.id) return null

  let convo = conversation
  if (!convo.id) {
    convo = await createConversation({
      currentUserId: user.id,
      targetUserId: convo.participant_2,
      gigId: convo.gig_id || null
    })
  }

  const { data: msg, error: rpcError } = await supabase.rpc('send_chat_message', {
    p_conversation_id: convo.id,
    p_sender_id: user.id,
    p_content: text,
    p_type: 'text'
  })

  if (rpcError) throw rpcError

  // Attach reply metadata if replying to a message
  if (replyTo && msg?.id) {
    await supabase.from('messages').update({
      reply_to_id: replyTo.id,
      reply_to_content: replyTo.content,
      reply_to_sender_name: replyTo.senderName,
    }).eq('id', msg.id)
    if (msg) {
      msg.reply_to_id = replyTo.id
      msg.reply_to_content = replyTo.content
      msg.reply_to_sender_name = replyTo.senderName
    }
  }

  const otherUserId = convo.participant_1 === user.id
    ? convo.participant_2
    : convo.participant_1
  const sender = convo.participant_1 === user.id ? convo.p1 : convo.p2
  const senderName = sender?.full_name || user.email?.split('@')[0] || 'Someone'
  const snippet = text.length > 40 ? text.substring(0, 40) + '...' : text

  await supabase.from('notifications').insert({
    user_id: otherUserId,
    title: `${senderName} sent you a message`,
    message: snippet,
    type: 'message',
    gig_id: convo.gig_id,
    conversation_id: convo.id
  })

  if (notifyPush && sendPushToUser) {
    await sendPushToUser(
      otherUserId,
      'New Message',
      snippet,
      { type: 'message', conversationId: convo.id }
    )
  }

  return { message: msg, conversation: convo }
}

export const hideConversationForUser = async (convo, userId) => {
  if (!convo?.id || !userId) return
  const hiddenFor = Array.from(new Set([...(convo.hidden_for || []), userId]))
  const { error } = await supabase
    .from('conversations')
    .update({ hidden_for: hiddenFor })
    .eq('id', convo.id)

  if (error) throw error
}

export const clearConversationForUser = async (convo, userId) => {
  if (!convo?.id || !userId) return null
  const isP1 = convo.participant_1 === userId
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('conversations')
    .update(isP1
      ? { cleared_at_1: now, unread_count_1: 0 }
      : { cleared_at_2: now, unread_count_2: 0 })
    .eq('id', convo.id)

  if (error) throw error
  return now
}

// ── Conversation helpers ──────────────────────────────────────────

export const isPinnedByUser = (convo, userId) => {
  if (!convo || !userId) return false
  return !!(convo.participant_1 === userId ? convo.pinned_1 : convo.pinned_2)
}

export const isMutedByUser = (convo, userId) => {
  if (!convo || !userId) return false
  return !!(convo.participant_1 === userId ? convo.muted_1 : convo.muted_2)
}

export const togglePinConversation = async (convo, userId) => {
  if (!convo?.id || !userId) return
  const field = convo.participant_1 === userId ? 'pinned_1' : 'pinned_2'
  const current = isPinnedByUser(convo, userId)
  const { error } = await supabase.from('conversations').update({ [field]: !current }).eq('id', convo.id)
  if (error) throw error
  return !current
}

export const toggleMuteConversation = async (convo, userId) => {
  if (!convo?.id || !userId) return
  const field = convo.participant_1 === userId ? 'muted_1' : 'muted_2'
  const current = isMutedByUser(convo, userId)
  const { error } = await supabase.from('conversations').update({ [field]: !current }).eq('id', convo.id)
  if (error) throw error
  return !current
}

export const markConversationUnread = async (convo, userId) => {
  if (!convo?.id || !userId) return
  const field = convo.participant_1 === userId ? 'unread_count_1' : 'unread_count_2'
  const { error } = await supabase.from('conversations').update({ [field]: 1 }).eq('id', convo.id)
  if (error) throw error
}

// ── Message helpers ───────────────────────────────────────────────

export const toggleMessageReaction = async (msg, emoji, userId) => {
  const reactions = { ...(msg.reactions || {}) }
  const users = reactions[emoji] || []
  if (users.includes(userId)) {
    reactions[emoji] = users.filter(id => id !== userId)
    if (reactions[emoji].length === 0) delete reactions[emoji]
  } else {
    reactions[emoji] = [...users, userId]
  }
  const { error } = await supabase.from('messages').update({ reactions }).eq('id', msg.id)
  if (error) throw error
  return reactions
}

export const updateConversationPreview = async (convoId, fallbackMessages = []) => {
  const latest = [...fallbackMessages].sort(
    (a, b) => parseTimestamp(b.created_at) - parseTimestamp(a.created_at)
  )[0]

  const { error } = await supabase
    .from('conversations')
    .update({
      last_message: latest?.content || '',
      last_message_at: latest?.created_at || new Date().toISOString()
    })
    .eq('id', convoId)

  if (error) throw error
}
