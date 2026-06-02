import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import EmptyState from '../EmptyState'
import { playMessage } from '../../utils/sounds'

const QUICK_REPLIES = [
  'On my way! 🚀',
  'Running 10 mins late',
  'Payment sent ✓',
  'Work completed!',
  'Can we reschedule?',
  'Sounds good 👍',
]

export default function ChatScreen() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [typing, setTyping] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const messagesEndRef = useRef()
  const inputRef = useRef()
  const typingTimeoutRef = useRef()
  const channelRef = useRef()

  useEffect(() => {
    fetchConversations()
  }, [user])

  useEffect(() => {
    const handleOpenChat = async (e) => {
      const { convoId } = e.detail
      if (!convoId || !user) return

      const { data } = await supabase
        .from('conversations')
        .select(`
          *,
          gigs(id, title, pay_min, pay_max, status),
          p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
          p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
        `)
        .eq('id', convoId)
        .single()

      if (data) {
        setActiveConvo(data)
        setConversations(prev =>
          prev.find(c => c.id === data.id) ? prev : [data, ...prev]
        )
      }
    }

    const handleOpenChatWithUser = async (e) => {
      const { userId: targetUserId, gigId } = e.detail
      if (!targetUserId || !user) return

      const { data: existing } = await supabase
        .from('conversations')
        .select(`
          *,
          gigs(id, title, pay_min, pay_max, status),
          p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
          p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
        `)
        .or(
          `and(participant_1.eq.${user.id},participant_2.eq.${targetUserId}),` +
          `and(participant_1.eq.${targetUserId},participant_2.eq.${user.id})`
        )
        .order('last_message_at', { ascending: false })
        .limit(10)

      const matchedExisting = existing?.find(convo =>
        gigId ? convo.gig_id === gigId : true
      ) || existing?.[0]

      if (matchedExisting) {
        setActiveConvo(matchedExisting)
        setConversations(prev =>
          prev.find(c => c.id === matchedExisting.id) ? prev : [matchedExisting, ...prev]
        )
        return
      }

      const { data: newConvo } = await supabase
        .from('conversations')
        .insert({
          gig_id: gigId || null,
          participant_1: user.id,
          participant_2: targetUserId,
          last_message: '',
          last_message_at: new Date().toISOString()
        })
        .select(`
          *,
          gigs(id, title, pay_min, pay_max, status),
          p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
          p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
        `)
        .single()

      if (newConvo) {
        setActiveConvo(newConvo)
        setMessages([])
        setConversations(prev => [newConvo, ...prev])
      }
    }

    window.addEventListener('openChat', handleOpenChat)
    window.addEventListener('openChatWithUser', handleOpenChatWithUser)

    // Handle pending mobile navigation (set by FloatingChat before navigating here)
    const pendingUserId = sessionStorage.getItem('pendingChatUserId')
    if (pendingUserId && user) {
      sessionStorage.removeItem('pendingChatUserId')
      const pendingGigId = sessionStorage.getItem('pendingChatGigId') || null
      sessionStorage.removeItem('pendingChatGigId')
      window.dispatchEvent(new CustomEvent('openChatWithUser', {
        detail: { userId: pendingUserId, gigId: pendingGigId || null }
      }))
    }

    return () => {
      window.removeEventListener('openChat', handleOpenChat)
      window.removeEventListener('openChatWithUser', handleOpenChatWithUser)
    }
  }, [user])

  useEffect(() => {
    if (activeConvo) {
      fetchMessages(activeConvo.id)
      markAsRead(activeConvo)
      subscribeToMessages(activeConvo.id)
    }
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [activeConvo?.id])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchConversations = async () => {
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        gigs(id, title, status, pay_min, pay_max),
        p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
        p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
      `)
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false })

    if (data) setConversations(data)
    setLoading(false)
  }

  const fetchMessages = async (convoId) => {
    setLoadingMessages(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data)
    setLoadingMessages(false)
  }

  const subscribeToMessages = (convoId) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel('messages-' + convoId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convoId}`
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev
          return [...prev, payload.new]
        })
        if (payload.new.sender_id !== user.id) {
          playMessage()
          markMessageRead(payload.new.id)
        }
      })
      .subscribe()
  }

  const markAsRead = async (convo) => {
    if (!convo) return
    const isP1 = convo.participant_1 === user.id
    await supabase
      .from('conversations')
      .update(isP1 ? { unread_count_1: 0 } : { unread_count_2: 0 })
      .eq('id', convo.id)
    fetchConversations()
  }

  const markMessageRead = async (messageId) => {
    await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', messageId)
  }

  const sendMessage = async (content = newMessage) => {
    if (!content.trim() || !activeConvo || sending) return
    setSending(true)
    const text = content.trim()
    setNewMessage('')
    setShowQuickReplies(false)

    const { data: msg } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConvo.id,
        sender_id: user.id,
        content: text,
        type: 'text'
      })
      .select()
      .single()

    // Update conversation last message
    const otherUserId = activeConvo.participant_1 === user.id
      ? activeConvo.participant_2
      : activeConvo.participant_1
    const isOtherP1 = activeConvo.participant_1 !== user.id
    const sender = activeConvo.participant_1 === user.id ? activeConvo.p1 : activeConvo.p2
    const senderName = sender?.full_name || user.email?.split('@')[0] || 'Someone'

    await supabase
      .from('conversations')
      .update({
        last_message: text,
        last_message_at: new Date().toISOString(),
        ...(isOtherP1
          ? { unread_count_1: (activeConvo.unread_count_1 || 0) + 1 }
          : { unread_count_2: (activeConvo.unread_count_2 || 0) + 1 })
      })
      .eq('id', activeConvo.id)

    // Send notification
    await supabase.from('notifications').insert({
      user_id: otherUserId,
      title: `${senderName} sent you a message`,
      message: `${text.length > 40 ? text.substring(0, 40) + '...' : text}`,
      type: 'message',
      gig_id: activeConvo.gig_id
    })

    setSending(false)
    fetchConversations()
  }

  const handleTyping = () => {
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false)
    }, 2000)
    setTyping(true)
  }

  const getOtherUser = (convo) => {
    if (!convo || !user) return null
    return convo.participant_1 === user.id ? convo.p2 : convo.p1
  }

  const getUnreadCount = (convo) => {
    if (!convo || !user) return 0
    return convo.participant_1 === user.id
      ? convo.unread_count_1 || 0
      : convo.unread_count_2 || 0
  }

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    })
  }

  const totalUnread = conversations.reduce((sum, c) => sum + getUnreadCount(c), 0)

  const isMobile = window.innerWidth < 768

  return (
    <div style={{
      display: 'flex', height: '100%',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      overflow: 'hidden'
    }}>

      {/* ── CONVERSATIONS LIST ── */}
      <div style={{
        width: isMobile && activeConvo ? '0' : isMobile ? '100%' : '320px',
        borderRight: '1.5px solid #E2E0FF',
        display: 'flex', flexDirection: 'column',
        background: '#fff', flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.3s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 16px 14px',
          borderBottom: '1.5px solid #E2E0FF'
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800', color: '#14123A'
              }}>Messages</div>
              {totalUnread > 0 && (
                <div style={{
                  fontSize: '12px', color: '#6C47FF',
                  fontWeight: '600', marginTop: '2px'
                }}>
                  {totalUnread} unread
                </div>
              )}
            </div>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: '#EEE9FF', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer'
            }}>
              <BrandIcon name="compose" size={28} active />
            </div>
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{
              padding: '32px', textAlign: 'center',
              color: '#A09DC8', fontSize: '14px'
            }}>Loading...</div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '24px 16px' }}>
              <EmptyState
                icon="chat"
                title="No messages yet"
                message="Apply for a gig or accept an applicant to start a conversation."
                actionLabel="Browse gigs"
                onAction={() => window.dispatchEvent(new CustomEvent('navigateTo', { detail: 'feed' }))}
              />
            </div>
          ) : (
            conversations.map(convo => {
              const other = getOtherUser(convo)
              const unread = getUnreadCount(convo)
              const isActive = activeConvo?.id === convo.id
              return (
                <div
                  key={convo.id}
                  onClick={() => setActiveConvo(convo)}
                  style={{
                    padding: '14px 16px',
                    display: 'flex', gap: '12px',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    background: isActive ? '#F8F7FF' : '#fff',
                    borderBottom: '1px solid #F5F4FF',
                    transition: 'background 0.1s',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = '#F8F7FF'
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = '#fff'
                  }}>

                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '13px',
                      background: '#EEE9FF', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: '800',
                      color: '#6C47FF', overflow: 'hidden'
                    }}>
                      {other?.avatar_url ? (
                        <img src={other.avatar_url} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : other?.full_name?.charAt(0) || '?'}
                    </div>
                    {/* Online dot */}
                    <div style={{
                      position: 'absolute', bottom: '-1px', right: '-1px',
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: '#00C48C', border: '2px solid #fff'
                    }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '3px'
                    }}>
                      <div style={{
                        fontSize: '14px', fontWeight: unread > 0 ? '700' : '600',
                        color: '#14123A', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {other?.full_name || 'Unknown'}
                      </div>
                      <div style={{
                        fontSize: '11px', color: '#A09DC8',
                        flexShrink: 0, marginLeft: '8px'
                      }}>
                        {timeAgo(convo.last_message_at)}
                      </div>
                    </div>

                    {convo.gigs && (
                      <div style={{
                        fontSize: '10px', color: '#6C47FF',
                        fontWeight: '600', marginBottom: '2px',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        Re: {convo.gigs.title}
                      </div>
                    )}

                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: unread > 0 ? '#14123A' : '#A09DC8',
                        fontWeight: unread > 0 ? '600' : '400',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', flex: 1
                      }}>
                        {convo.last_message || 'No messages yet'}
                      </div>
                      {unread > 0 && (
                        <div style={{
                          background: '#6C47FF', color: '#fff',
                          borderRadius: '50%', width: '20px', height: '20px',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '10px',
                          fontWeight: '800', flexShrink: 0, marginLeft: '6px'
                        }}>
                          {unread > 9 ? '9+' : unread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── CHAT WINDOW ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#F8F7FF', overflow: 'hidden',
        display: isMobile && !activeConvo ? 'none' : 'flex'
      }}>
        {!activeConvo ? (
          /* Empty state */
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column',
            gap: '12px', padding: '40px'
          }}>
            <BrandIcon name="chat" size={58} />
            <div style={{
              fontSize: '18px', fontWeight: '800',
              color: '#14123A', textAlign: 'center'
            }}>Select a conversation</div>
            <div style={{
              fontSize: '13px', color: '#A09DC8',
              textAlign: 'center', lineHeight: '1.6'
            }}>
              Choose a conversation from the left to start messaging
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            {(() => {
              const other = getOtherUser(activeConvo)
              return (
                <div style={{
                  padding: '14px 20px',
                  background: '#fff',
                  borderBottom: '1.5px solid #E2E0FF',
                  display: 'flex', gap: '12px',
                  alignItems: 'center', flexShrink: 0
                }}>
                  {/* Back button mobile */}
                  {isMobile && (
                    <button
                      onClick={() => setActiveConvo(null)}
                      style={{
                        background: 'none', border: 'none',
                        fontSize: '20px', cursor: 'pointer',
                        color: '#6C47FF', padding: '0',
                        fontFamily: 'inherit'
                      }}>←</button>
                  )}

                  {/* Avatar */}
                  <div
                    onClick={() => setViewingProfile(other?.id)}
                    style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      background: '#EEE9FF', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', fontWeight: '800',
                      color: '#6C47FF', overflow: 'hidden',
                      flexShrink: 0, cursor: 'pointer',
                      border: '2px solid #B8A5FF'
                    }}>
                    {other?.avatar_url ? (
                      <img src={other.avatar_url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : other?.full_name?.charAt(0) || '?'}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      onClick={() => setViewingProfile(other?.id)}
                      style={{
                        fontSize: '15px', fontWeight: '700',
                        color: '#14123A', cursor: 'pointer',
                        marginBottom: '2px'
                      }}>
                      {other?.full_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#00C48C', fontWeight: '600' }}>
                      🟢 Online · Trust {other?.trust_score || 100}%
                    </div>
                  </div>

                  {/* Gig context */}
                  {activeConvo.gigs && (
                    <div style={{
                      background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                      borderRadius: '10px', padding: '8px 12px',
                      maxWidth: '160px'
                    }}>
                      <div style={{
                        fontSize: '9px', color: '#6C47FF', fontWeight: '700',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        marginBottom: '2px'
                      }}>Re: Gig</div>
                      <div style={{
                        fontSize: '11px', fontWeight: '700',
                        color: '#14123A', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {activeConvo.gigs.title}
                      </div>
                      <div style={{
                        fontSize: '10px', color: '#00C48C', fontWeight: '700'
                      }}>
                        ${activeConvo.gigs.pay_min}–${activeConvo.gigs.pay_max}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex', flexDirection: 'column',
              gap: '4px'
            }}>
              {loadingMessages ? (
                <div style={{
                  textAlign: 'center', padding: '32px',
                  color: '#A09DC8', fontSize: '14px'
                }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '16px',
                    background: 'linear-gradient(135deg, #EEE9FF, #F8F5FF)',
                    border: '1.5px solid #B8A5FF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <BrandIcon name="chat" size={36} active />
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700',
                    color: '#14123A', marginBottom: '4px'
                  }}>Start the conversation</div>
                  <div style={{ fontSize: '12px', color: '#A09DC8' }}>
                    Send a message to get things moving
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const isMe = msg.sender_id === user.id
                    const prevMsg = messages[i - 1]
                    const nextMsg = messages[i + 1]
                    const showTime = !nextMsg ||
                      new Date(nextMsg.created_at) - new Date(msg.created_at) > 300000
                    const isGrouped = prevMsg &&
                      prevMsg.sender_id === msg.sender_id &&
                      new Date(msg.created_at) - new Date(prevMsg.created_at) < 60000

                    return (
                      <div key={msg.id}>
                        {/* Date divider */}
                        {(!prevMsg ||
                          new Date(msg.created_at).toDateString() !==
                          new Date(prevMsg.created_at).toDateString()) && (
                          <div style={{
                            textAlign: 'center', margin: '12px 0',
                            fontSize: '11px', color: '#A09DC8', fontWeight: '600'
                          }}>
                            {new Date(msg.created_at).toLocaleDateString('en-US', {
                              weekday: 'long', month: 'short', day: 'numeric'
                            })}
                          </div>
                        )}

                        <div style={{
                          display: 'flex',
                          justifyContent: isMe ? 'flex-end' : 'flex-start',
                          marginBottom: isGrouped ? '2px' : '8px',
                          alignItems: 'flex-end', gap: '8px'
                        }}>
                          {/* Other person avatar */}
                          {!isMe && (
                            <div style={{
                              width: '28px', height: '28px',
                              borderRadius: '8px', background: '#EEE9FF',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '11px',
                              fontWeight: '800', color: '#6C47FF',
                              overflow: 'hidden', flexShrink: 0,
                              opacity: isGrouped ? 0 : 1
                            }}>
                              {getOtherUser(activeConvo)?.avatar_url ? (
                                <img
                                  src={getOtherUser(activeConvo).avatar_url}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : getOtherUser(activeConvo)?.full_name?.charAt(0) || '?'}
                            </div>
                          )}

                          <div style={{ maxWidth: '70%' }}>
                            {/* Message bubble */}
                            <div style={{
                              background: isMe
                                ? 'linear-gradient(135deg, #6C47FF, #9B59FF)'
                                : '#fff',
                              color: isMe ? '#fff' : '#14123A',
                              borderRadius: isMe
                                ? '18px 18px 4px 18px'
                                : '18px 18px 18px 4px',
                              padding: '10px 14px',
                              fontSize: '14px', lineHeight: '1.5',
                              boxShadow: isMe
                                ? '0 2px 12px rgba(108,71,255,0.3)'
                                : '0 2px 8px rgba(0,0,0,0.06)',
                              border: isMe ? 'none' : '1px solid #E2E0FF',
                              wordBreak: 'break-word'
                            }}>
                              {msg.content}
                            </div>

                            {/* Time + read receipt */}
                            {showTime && (
                              <div style={{
                                fontSize: '10px', color: '#A09DC8',
                                marginTop: '3px', fontWeight: '500',
                                textAlign: isMe ? 'right' : 'left',
                                display: 'flex',
                                justifyContent: isMe ? 'flex-end' : 'flex-start',
                                alignItems: 'center', gap: '4px'
                              }}>
                                {formatTime(msg.created_at)}
                                {isMe && (
                                  <span style={{
                                    color: msg.read ? '#6C47FF' : '#A09DC8',
                                    fontSize: '11px'
                                  }}>
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

                  {/* Typing indicator */}
                  {otherTyping && (
                    <div style={{
                      display: 'flex', gap: '8px',
                      alignItems: 'flex-end', marginBottom: '8px'
                    }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: '#EEE9FF', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '800', color: '#6C47FF'
                      }}>
                        {getOtherUser(activeConvo)?.full_name?.charAt(0) || '?'}
                      </div>
                      <div style={{
                        background: '#fff', borderRadius: '18px 18px 18px 4px',
                        padding: '12px 16px',
                        border: '1px solid #E2E0FF',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                        display: 'flex', gap: '4px', alignItems: 'center'
                      }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#A09DC8',
                            animation: `typingDot 1.2s ease infinite`,
                            animationDelay: `${i * 0.2}s`
                          }} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies */}
            {showQuickReplies && (
              <div style={{
                padding: '8px 16px',
                display: 'flex', gap: '8px',
                overflowX: 'auto', scrollbarWidth: 'none',
                background: '#fff',
                borderTop: '1px solid #F5F4FF'
              }}>
                {QUICK_REPLIES.map(reply => (
                  <button
                    key={reply}
                    onClick={() => sendMessage(reply)}
                    style={{
                      background: '#EEE9FF', border: '1.5px solid #B8A5FF',
                      borderRadius: '20px', padding: '6px 13px',
                      fontSize: '12px', fontWeight: '600',
                      color: '#6C47FF', cursor: 'pointer',
                      whiteSpace: 'nowrap', fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#6C47FF'
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#EEE9FF'
                      e.currentTarget.style.color = '#6C47FF'
                    }}>
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {/* Message Input */}
            <div style={{
              padding: '12px 16px',
              background: '#fff',
              borderTop: '1.5px solid #E2E0FF',
              display: 'flex', gap: '10px',
              alignItems: 'flex-end', flexShrink: 0
            }}>
              {/* Quick replies toggle */}
              <button
                onClick={() => setShowQuickReplies(q => !q)}
                style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: showQuickReplies ? '#EEE9FF' : '#F5F4FF',
                  border: `1.5px solid ${showQuickReplies ? '#B8A5FF' : '#E2E0FF'}`,
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit'
                }}>
                <BrandIcon name="suggest" size={26} active={showQuickReplies} />
              </button>

              {/* Input */}
              <div style={{
                flex: 1, background: '#F5F4FF',
                border: '1.5px solid #E2E0FF',
                borderRadius: '14px', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'border-color 0.15s'
              }}>
                <textarea
                  ref={inputRef}
                  value={newMessage}
                  onChange={e => {
                    setNewMessage(e.target.value)
                    handleTyping()
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="Message..."
                  rows={1}
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    outline: 'none', fontSize: '14px', color: '#14123A',
                    fontFamily: 'inherit', resize: 'none',
                    lineHeight: '1.5', maxHeight: '120px',
                    overflowY: 'auto'
                  }}
                />
              </div>

              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={!newMessage.trim() || sending}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: newMessage.trim()
                    ? 'linear-gradient(135deg, #6C47FF, #9B59FF)'
                    : '#E2E0FF',
                  border: 'none', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', cursor: newMessage.trim() ? 'pointer' : 'default',
                  flexShrink: 0, transition: 'all 0.2s',
                  boxShadow: newMessage.trim()
                    ? '0 4px 16px rgba(108,71,255,0.4)'
                    : 'none'
                }}>
                <BrandIcon name="send" size={28} active={Boolean(newMessage.trim()) && !sending} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Public Profile */}
      {viewingProfile && (
        <PublicProfile
          userId={viewingProfile}
          onClose={() => setViewingProfile(null)}
        />
      )}

      <style>{`
        @keyframes typingDot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
