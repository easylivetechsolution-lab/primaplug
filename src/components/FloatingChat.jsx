import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { playMessage } from '../utils/sounds'
import { sendPushToUser } from '../utils/pushNotifications'
import PublicProfile from './PublicProfile'
import BrandIcon from './BrandIcon'
import {
  fetchConversationById,
  fetchConversations as fetchChatConversations,
  fetchMessages as fetchChatMessages,
  getOrCreateConversation,
  getOtherUser as getChatOtherUser,
  getUnreadCount,
  markConversationRead,
  parseTimestamp,
  sendMessage as sendChatMessage,
  toggleMessageReaction,
} from '../utils/chat'

const isImageUrl = (content) =>
  /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|heic|heif|avif|bmp|svg)(\?.*)?$/i.test(content)

const isVideoUrl = (content) =>
  /^https?:\/\/.+\.(mp4|mov|avi|webm|mkv|m4v|3gp|ogv)(\?.*)?$/i.test(content)

const isStorageUrl = (content) =>
  typeof content === 'string' && content.startsWith('https://') && content.includes('supabase.co/storage')

const getAttachmentFilename = (url) => {
  try {
    const seg = decodeURIComponent(url.split('/').pop().split('?')[0])
    const dash = seg.indexOf('-')
    return dash > -1 ? seg.slice(dash + 1) : seg
  } catch { return 'File' }
}

const previewLabel = (text) => {
  if (!text) return 'No messages yet'
  if (isImageUrl(text)) return '📷 Photo'
  if (isVideoUrl(text)) return '🎥 Video'
  if (isStorageUrl(text)) return '📎 File'
  return text
}

export default function FloatingChat({ onOpenFullChat }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [pulse, setPulse] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [replyingTo, setReplyingTo] = useState(null)
  const [reactingTo, setReactingTo] = useState(null)
  const [lightboxImg, setLightboxImg] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [msgMenu, setMsgMenu] = useState(null)
  const messagesEndRef = useRef()
  const inputRef = useRef()
  const channelRef = useRef()
  const convoChannelRef = useRef()
  const presenceChannelRef = useRef()

  useEffect(() => {
    if (!user) return

    fetchConversations()
    subscribeToNewMessages()

    // Presence
    const ch = supabase.channel('float-presence')
      .on('presence', { event: 'sync' }, () => {
        const ids = new Set()
        Object.values(ch.presenceState()).forEach(list =>
          list.forEach(p => { if (p.user_id) ids.add(p.user_id) })
        )
        setOnlineUsers(ids)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev)
          newPresences.forEach(p => p.user_id && next.add(p.user_id))
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setOnlineUsers(prev => {
          const next = new Set(prev)
          leftPresences.forEach(p => p.user_id && next.delete(p.user_id))
          return next
        })
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ user_id: user.id })
      })
    presenceChannelRef.current = ch

    const handleOpenChat = async (e) => {
      const { convoId } = e.detail
      if (!convoId) return
      setOpen(true)
      const data = await fetchConversationById(convoId, user.id)
      if (data) {
        setActiveConvo(data)
        setConversations(prev =>
          prev.find(c => c.id === data.id) ? prev : [data, ...prev]
        )
      }
    }

    const handleOpenChatWithUser = async (e) => {
      const { userId: targetUserId, gigId } = e.detail
      if (!targetUserId) return

      if (window.innerWidth <= 768) {
        sessionStorage.setItem('pendingChatUserId', targetUserId)
        sessionStorage.setItem('pendingChatGigId', gigId || '')
        window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: { screen: 'chat' } }))
        return
      }

      setOpen(true)
      const convo = await getOrCreateConversation({ currentUser: user, targetUserId, gigId: gigId || null })
      if (convo?.id) {
        setActiveConvo(convo)
        await fetchMessages(convo)
        await markAsRead(convo)
      } else {
        setActiveConvo(convo)
        setMessages([])
      }
      await fetchConversations()
    }

    window.addEventListener('openChat', handleOpenChat)
    window.addEventListener('openChatWithUser', handleOpenChatWithUser)

    return () => {
      window.removeEventListener('openChat', handleOpenChat)
      window.removeEventListener('openChatWithUser', handleOpenChatWithUser)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
      if (presenceChannelRef.current) supabase.removeChannel(presenceChannelRef.current)
    }
  }, [user])

  useEffect(() => {
    if (activeConvo?.id) {
      fetchMessages(activeConvo)
      subscribeToConvoMessages(activeConvo.id)
    }
    return () => {
      if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
    }
  }, [activeConvo?.id])

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }, [messages])

  useEffect(() => {
    if (open && activeConvo) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open, activeConvo])

  // Close menus on outside click
  useEffect(() => {
    const handler = () => { setMsgMenu(null); setReactingTo(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchConversations() {
    if (!user) return
    const data = await fetchChatConversations(user.id, { includeEmpty: true })
    setConversations(data)
    setTotalUnread(data.reduce((sum, c) => sum + getUnread(c), 0))
  }

  function subscribeToNewMessages() {
    if (!user) return
    channelRef.current = supabase
      .channel('floating-chat-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        if (payload.new.sender_id === user.id) return
        playMessage()
        setPulse(true)
        setTimeout(() => setPulse(false), 2000)
        fetchConversations()
        if (activeConvo?.id === payload.new.conversation_id) {
          setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
          await markAsRead(activeConvo)
        }
      })
      .subscribe()
  }

  function subscribeToConvoMessages(convoId) {
    if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
    convoChannelRef.current = supabase
      .channel('float-convo-' + convoId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${convoId}`
      }, (payload) => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new])
      })
      .subscribe()
  }

  async function fetchMessages(convo) {
    setLoadingMsgs(true)
    try {
      const data = await fetchChatMessages(convo, user.id)
      setMessages(data)
    } finally {
      setLoadingMsgs(false)
    }
  }

  async function markAsRead(convo) {
    if (!convo || !user) return
    await markConversationRead(convo, user.id)
    fetchConversations()
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvo || sending) return
    setSending(true)
    const text = newMessage.trim()
    setNewMessage('')

    const tempId = 'temp-' + Date.now()
    const pendingReply = replyingTo
    setReplyingTo(null)
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: activeConvo.id,
      sender_id: user.id, content: text,
      created_at: new Date().toISOString(), read: false,
      reactions: {}, reply_to_id: pendingReply?.id || null,
      reply_to_content: pendingReply?.content || null,
      reply_to_sender_name: pendingReply?.senderName || null,
    }])

    try {
      const result = await sendChatMessage({
        user, conversation: activeConvo, content: text,
        replyTo: pendingReply, notifyPush: true, sendPushToUser
      })
      if (result?.conversation?.id && !activeConvo.id) setActiveConvo(result.conversation)
      if (result?.message) {
        setMessages(prev => {
          const without = prev.filter(m => m.id !== tempId && m.id !== result.message.id)
          return [...without, result.message]
        })
      }
      await fetchConversations()
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setNewMessage(text)
      setReplyingTo(pendingReply)
      alert('Could not send: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const handleReaction = async (msg, emoji) => {
    try {
      const newReactions = await toggleMessageReaction(msg, emoji, user.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: newReactions } : m))
    } catch (err) {
      alert('Could not react: ' + err.message)
    }
    setReactingTo(null)
  }

  const getOtherUser = (convo) => {
    if (!convo || !user) return null
    return getChatOtherUser(convo, user.id)
  }

  const getUnread = (convo) => {
    if (!convo || !user) return 0
    return getUnreadCount(convo, user.id)
  }

  const timeAgo = (date) => {
    const s = Math.floor((new Date() - parseTimestamp(date)) / 1000)
    if (s < 60) return 'now'
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return parseTimestamp(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (date) => parseTimestamp(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <>
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 8000 }}>

        {open && (
          <div style={{
            width: '360px', height: '540px',
            background: '#fff', borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(108,71,255,0.2)',
            border: '1.5px solid #E2E0FF',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            animation: 'chatPop 0.25s cubic-bezier(0.16,1,0.3,1)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            position: 'fixed', bottom: '90px', right: '24px', zIndex: 8000
          }}>

            {/* Header */}
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeConvo && (
                  <button
                    onClick={() => { setActiveConvo(null); setMessages([]); setReplyingTo(null) }}
                    style={{
                      background: 'rgba(255,255,255,0.2)', border: 'none',
                      borderRadius: '8px', width: '28px', height: '28px',
                      color: '#fff', fontSize: '14px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'inherit'
                    }}>←</button>
                )}
                <div>
                  {activeConvo ? (
                    <>
                      <div
                        onClick={() => setViewingProfile(getOtherUser(activeConvo)?.id)}
                        style={{ fontSize: '14px', fontWeight: '700', color: '#fff', cursor: 'pointer' }}>
                        {getOtherUser(activeConvo)?.full_name || 'Chat'}
                      </div>
                      <div style={{ fontSize: '10px', color: onlineUsers.has(getOtherUser(activeConvo)?.id) ? '#A8FFD8' : 'rgba(255,255,255,0.55)', fontWeight: '600' }}>
                        {onlineUsers.has(getOtherUser(activeConvo)?.id) ? '● Online' : '● Offline'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Messages</div>
                  )}
                  {activeConvo?.gigs && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>
                      Re: {activeConvo.gigs.title}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => { setOpen(false); onOpenFullChat && onOpenFullChat() }}
                  title="Open full chat"
                  style={{
                    background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
                    width: '28px', height: '28px', color: '#fff', fontSize: '14px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: 'inherit'
                  }}>⤢</button>
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px',
                    width: '28px', height: '28px', color: '#fff', fontSize: '16px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontFamily: 'inherit'
                  }}>×</button>
              </div>
            </div>

            {/* Conversation List */}
            {!activeConvo && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {conversations.length === 0 ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                      <BrandIcon name="chat" size={56} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#14123A', marginBottom: '4px' }}>
                      No messages yet
                    </div>
                    <div style={{ fontSize: '12px', color: '#A09DC8', lineHeight: '1.5' }}>
                      Apply for a gig to start a conversation
                    </div>
                  </div>
                ) : conversations.map(convo => {
                  const other = getOtherUser(convo)
                  const unread = getUnread(convo)
                  const isOnline = onlineUsers.has(other?.id)
                  return (
                    <div
                      key={convo.id}
                      onClick={() => { setActiveConvo(convo); markAsRead(convo) }}
                      style={{
                        padding: '12px 14px', display: 'flex', gap: '10px',
                        alignItems: 'center', cursor: 'pointer',
                        borderBottom: '1px solid #F5F4FF', transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '12px',
                          background: '#EEE9FF', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '16px', fontWeight: '800',
                          color: '#6C47FF', overflow: 'hidden'
                        }}>
                          {other?.avatar_url
                            ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : other?.full_name?.charAt(0) || '?'}
                        </div>
                        <div style={{
                          position: 'absolute', bottom: '-1px', right: '-1px',
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: isOnline ? '#00C48C' : '#CBD5E1',
                          border: '2px solid #fff', transition: 'background 0.3s'
                        }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '2px'
                        }}>
                          <div style={{
                            fontSize: '13px', fontWeight: unread > 0 ? '700' : '600',
                            color: '#14123A', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                          }}>{other?.full_name || 'Unknown'}</div>
                          <div style={{ fontSize: '10px', color: '#A09DC8', flexShrink: 0, marginLeft: '6px' }}>
                            {timeAgo(convo.last_message_at)}
                          </div>
                        </div>
                        {convo.gigs && (
                          <div style={{
                            fontSize: '9px', color: '#6C47FF', fontWeight: '600',
                            marginBottom: '1px', overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>Re: {convo.gigs.title}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{
                            fontSize: '11px', color: unread > 0 ? '#14123A' : '#A09DC8',
                            fontWeight: unread > 0 ? '600' : '400',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', flex: 1
                          }}>
                            {previewLabel(convo.last_message)}
                          </div>
                          {unread > 0 && (
                            <div style={{
                              background: '#6C47FF', color: '#fff', borderRadius: '50%',
                              width: '18px', height: '18px', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: '9px', fontWeight: '800', flexShrink: 0, marginLeft: '4px'
                            }}>{unread > 9 ? '9+' : unread}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Active Conversation */}
            {activeConvo && (
              <>
                {/* Messages */}
                <div style={{
                  flex: 1, overflowY: 'auto', padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: '2px',
                  background: '#F8F7FF'
                }}>
                  {loadingMsgs ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#A09DC8', fontSize: '13px' }}>
                      Loading...
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>👋</div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#14123A', marginBottom: '3px' }}>
                        Say hello!
                      </div>
                      <div style={{ fontSize: '11px', color: '#A09DC8' }}>Start the conversation</div>
                    </div>
                  ) : messages.map((msg, i) => {
                    const isMe = msg.sender_id === user.id
                    const prevMsg = messages[i - 1]
                    const nextMsg = messages[i + 1]
                    const showTime = !nextMsg ||
                      parseTimestamp(nextMsg.created_at) - parseTimestamp(msg.created_at) > 300000
                    const isGrouped = prevMsg &&
                      prevMsg.sender_id === msg.sender_id &&
                      parseTimestamp(msg.created_at) - parseTimestamp(prevMsg.created_at) < 60000
                    const showDate = !prevMsg ||
                      parseTimestamp(msg.created_at).toDateString() !== parseTimestamp(prevMsg.created_at).toDateString()
                    const hasReactions = msg.reactions && Object.keys(msg.reactions).length > 0

                    return (
                      <div key={msg.id} id={`float-msg-${msg.id}`}>
                        {showDate && (
                          <div style={{
                            textAlign: 'center', margin: '10px 0 4px',
                            fontSize: '10px', color: '#A09DC8', fontWeight: '600'
                          }}>
                            {parseTimestamp(msg.created_at).toLocaleDateString('en-US', {
                              weekday: 'short', month: 'short', day: 'numeric'
                            })}
                          </div>
                        )}

                        <div
                          onMouseEnter={() => setHoveredMsg(msg.id)}
                          onMouseLeave={() => setHoveredMsg(null)}
                          style={{
                            display: 'flex',
                            justifyContent: isMe ? 'flex-end' : 'flex-start',
                            marginBottom: isGrouped ? '2px' : '6px',
                            alignItems: 'flex-end', gap: '6px',
                            position: 'relative'
                          }}>

                          {!isMe && (
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '7px',
                              background: '#EEE9FF', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '10px', fontWeight: '800',
                              color: '#6C47FF', overflow: 'hidden', flexShrink: 0,
                              opacity: isGrouped ? 0 : 1
                            }}>
                              {getOtherUser(activeConvo)?.avatar_url
                                ? <img src={getOtherUser(activeConvo).avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : getOtherUser(activeConvo)?.full_name?.charAt(0) || '?'}
                            </div>
                          )}

                          <div style={{ maxWidth: '75%', position: 'relative' }}>
                            {/* Message bubble */}
                            <div style={{
                              background: isMe ? 'linear-gradient(135deg, #6C47FF, #9B59FF)' : '#fff',
                              color: isMe ? '#fff' : '#14123A',
                              borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                              padding: (isImageUrl(msg.content) || isVideoUrl(msg.content)) ? '4px' : '8px 12px',
                              fontSize: '13px', lineHeight: '1.5',
                              boxShadow: isMe ? '0 2px 10px rgba(108,71,255,0.3)' : '0 2px 6px rgba(0,0,0,0.06)',
                              border: isMe ? 'none' : '1px solid #E2E0FF',
                              wordBreak: 'break-word', overflow: 'hidden'
                            }}>
                              {/* Reply context */}
                              {msg.reply_to_id && (
                                <div
                                  onClick={() => {
                                    const el = document.getElementById(`float-msg-${msg.reply_to_id}`)
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                  }}
                                  style={{
                                    background: isMe ? 'rgba(255,255,255,0.15)' : '#F5F4FF',
                                    borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.6)' : '#6C47FF'}`,
                                    borderRadius: '6px', padding: '5px 8px',
                                    marginBottom: '6px', fontSize: '11px',
                                    opacity: 0.9, cursor: 'pointer'
                                  }}>
                                  <div style={{ fontWeight: '700', marginBottom: '1px', fontSize: '10px' }}>
                                    {msg.reply_to_sender_name}
                                  </div>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                                    {isImageUrl(msg.reply_to_content) ? '📷 Photo' : isVideoUrl(msg.reply_to_content) ? '🎥 Video' : isStorageUrl(msg.reply_to_content) ? '📎 File' : msg.reply_to_content}
                                  </div>
                                </div>
                              )}

                              {/* Content */}
                              {isImageUrl(msg.content) ? (
                                <img
                                  src={msg.content} alt="attachment"
                                  style={{ maxWidth: '200px', maxHeight: '180px', borderRadius: '10px', display: 'block', objectFit: 'cover', cursor: 'pointer' }}
                                  onClick={() => setLightboxImg(msg.content)}
                                />
                              ) : isVideoUrl(msg.content) ? (
                                <video
                                  src={msg.content} controls
                                  style={{ maxWidth: '200px', maxHeight: '160px', borderRadius: '10px', display: 'block' }}
                                />
                              ) : isStorageUrl(msg.content) ? (
                                <a
                                  href={msg.content} target="_blank" rel="noopener noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    color: isMe ? '#fff' : '#6C47FF', textDecoration: 'none', padding: '4px 2px'
                                  }}>
                                  <span style={{ fontSize: '20px', flexShrink: 0 }}>📎</span>
                                  <span style={{ textDecoration: 'underline', wordBreak: 'break-all', fontSize: '12px' }}>
                                    {getAttachmentFilename(msg.content)}
                                  </span>
                                </a>
                              ) : msg.content}
                            </div>

                            {/* Reactions */}
                            {hasReactions && (
                              <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px',
                                justifyContent: isMe ? 'flex-end' : 'flex-start'
                              }}>
                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg, emoji)}
                                    style={{
                                      background: users.includes(user.id) ? '#EEE9FF' : '#F5F4FF',
                                      border: `1px solid ${users.includes(user.id) ? '#B8A5FF' : '#E2E0FF'}`,
                                      borderRadius: '10px', padding: '2px 6px',
                                      fontSize: '11px', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '2px',
                                      fontFamily: 'inherit', color: '#14123A'
                                    }}>
                                    {emoji} <span style={{ fontSize: '10px', fontWeight: '600' }}>{users.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Inline reaction picker */}
                            {reactingTo === msg.id && (
                              <div style={{
                                position: 'absolute', bottom: '110%',
                                [isMe ? 'right' : 'left']: 0,
                                background: '#fff', border: '1.5px solid #E2E0FF',
                                borderRadius: '24px', padding: '5px 8px',
                                boxShadow: '0 8px 24px rgba(108,71,255,0.18)',
                                display: 'flex', gap: '3px', zIndex: 10002
                              }}>
                                {['❤️','😂','😍','👍','😢','😡'].map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg, emoji)}
                                    style={{
                                      fontSize: '18px', background: 'none', border: 'none',
                                      cursor: 'pointer', borderRadius: '6px', padding: '3px',
                                      lineHeight: 1
                                    }}>
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Message ⋯ menu */}
                            {hoveredMsg === msg.id && (
                              <div style={{
                                position: 'absolute', top: '4px',
                                [isMe ? 'left' : 'right']: '-30px',
                                zIndex: 10001
                              }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMsgMenu(prev => prev === msg.id ? null : msg.id)
                                    setReactingTo(null)
                                  }}
                                  style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    border: '1px solid #E2E0FF', background: '#fff',
                                    color: '#6C47FF', cursor: 'pointer', fontSize: '14px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0
                                  }}>⋯</button>
                                {msgMenu === msg.id && (
                                  <div
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      position: 'absolute', top: '28px',
                                      [isMe ? 'left' : 'right']: 0,
                                      background: '#fff', border: '1.5px solid #E2E0FF',
                                      borderRadius: '12px', boxShadow: '0 8px 24px rgba(108,71,255,0.15)',
                                      zIndex: 10002, minWidth: '120px', overflow: 'hidden'
                                    }}>
                                    {[
                                      {
                                        label: 'Reply', action: () => {
                                          const other = getOtherUser(activeConvo)
                                          setReplyingTo({ id: msg.id, content: msg.content, senderName: isMe ? 'You' : (other?.full_name || 'Them') })
                                          setMsgMenu(null)
                                          inputRef.current?.focus()
                                        }
                                      },
                                      {
                                        label: 'React', action: () => {
                                          setReactingTo(msg.id)
                                          setMsgMenu(null)
                                        }
                                      }
                                    ].map(item => (
                                      <button key={item.label} onClick={item.action} style={{
                                        width: '100%', textAlign: 'left', padding: '9px 12px',
                                        border: 'none', background: 'transparent', color: '#14123A',
                                        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
                                        borderBottom: '1px solid #F5F4FF'
                                      }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        {item.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Time + read receipt */}
                            {showTime && (
                              <div style={{
                                fontSize: '9px', color: '#A09DC8', marginTop: '2px',
                                display: 'flex',
                                justifyContent: isMe ? 'flex-end' : 'flex-start',
                                alignItems: 'center', gap: '3px'
                              }}>
                                {formatTime(msg.created_at)}
                                {isMe && (
                                  <span style={{ color: msg.read ? '#6C47FF' : '#A09DC8', fontSize: '10px' }}>
                                    {msg.read ? '✓✓' : '✓'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply toolbar */}
                {replyingTo && (
                  <div style={{
                    padding: '6px 12px', background: '#F5F4FF',
                    borderTop: '1px solid #E2E0FF',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#6C47FF', fontWeight: '700', marginBottom: '1px' }}>
                        Replying to {replyingTo.senderName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#A09DC8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyingTo.content}
                      </div>
                    </div>
                    <button onClick={() => setReplyingTo(null)} style={{
                      background: 'none', border: 'none', fontSize: '16px',
                      cursor: 'pointer', color: '#A09DC8', padding: '2px', lineHeight: 1
                    }}>✕</button>
                  </div>
                )}

                {/* Input */}
                <div style={{
                  padding: '10px 12px', background: '#fff',
                  borderTop: '1.5px solid #E2E0FF',
                  display: 'flex', gap: '8px', alignItems: 'flex-end'
                }}>
                  <input
                    ref={inputRef}
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                    }}
                    placeholder="Message..."
                    style={{
                      flex: 1, background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF', borderRadius: '12px',
                      padding: '9px 13px', fontSize: '13px', color: '#14123A',
                      fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.15s'
                    }}
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    style={{
                      width: '38px', height: '38px', borderRadius: '11px',
                      background: newMessage.trim() ? 'linear-gradient(135deg, #6C47FF, #9B59FF)' : '#E2E0FF',
                      border: 'none', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '16px',
                      cursor: newMessage.trim() ? 'pointer' : 'default',
                      flexShrink: 0, transition: 'all 0.2s',
                      boxShadow: newMessage.trim() ? '0 3px 12px rgba(108,71,255,0.4)' : 'none'
                    }}>
                    {sending ? '⏳' : '➤'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Floating Button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: '56px', height: '56px', borderRadius: '50%',
            background: open ? '#fff' : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: open ? '1.5px solid #E2E0FF' : 'none',
            boxShadow: open ? '0 4px 20px rgba(108,71,255,0.2)' : '0 4px 24px rgba(108,71,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '22px', transition: 'all 0.2s',
            animation: pulse ? 'chatBounce 0.5s ease' : 'none', position: 'relative'
          }}>
          <span style={{ transition: 'transform 0.2s' }}>
            {open ? '×' : <BrandIcon name="chat" size={38} />}
          </span>
          {!open && totalUnread > 0 && (
            <div style={{
              position: 'absolute', top: '-2px', right: '-2px',
              background: '#FF3366', color: '#fff', borderRadius: '50%',
              width: totalUnread > 9 ? '22px' : '18px', height: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', fontWeight: '800', border: '2px solid #fff',
              animation: 'badgePop 0.3s ease'
            }}>
              {totalUnread > 9 ? '9+' : totalUnread}
            </div>
          )}
        </button>
      </div>

      {/* Public Profile */}
      {viewingProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
          <PublicProfile userId={viewingProfile} onClose={() => setViewingProfile(null)} />
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
          <img
            src={lightboxImg} alt="attachment"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '95vw', maxHeight: '90vh', borderRadius: '12px', objectFit: 'contain' }}
          />
          <button
            onClick={() => setLightboxImg(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>×</button>
          <a
            href={lightboxImg} download onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: '24px',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '20px', padding: '8px 20px',
              color: '#fff', fontSize: '13px', fontWeight: '600', textDecoration: 'none'
            }}>⬇ Download</a>
        </div>
      )}

      <style>{`
        @keyframes chatPop {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes chatBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        @keyframes badgePop {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
      `}</style>
    </>
  )
}
