import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import { playMessage } from '../utils/sounds'
import PublicProfile from './PublicProfile'
import BrandIcon from './BrandIcon'

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
  const [chatPos, setChatPos] = useState({ bottom: 120, right: 24 })
  const messagesEndRef = useRef()
  const inputRef = useRef()
  const channelRef = useRef()
  const convoChannelRef = useRef()
  const chatDrag = useRef({ on: false, moved: false, sx: 0, sy: 0, sb: 120, sr: 24 })

  useEffect(() => {
    if (!user) return

    fetchConversations()
    subscribeToNewMessages()

    const handleOpenChat = async (e) => {
      const { convoId } = e.detail
      if (!convoId) return
      setOpen(true)

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
      console.log('openChatWithUser received', targetUserId, gigId)
      if (!targetUserId) return

      // Get fresh user from supabase session
      const { data: { session } } = await supabase.auth.getSession()
      const currentUserId = session?.user?.id
      if (!currentUserId) return

      setOpen(true)

      const { data: existing } = await supabase
        .from('conversations')
        .select(`
          *,
          gigs(id, title, pay_min, pay_max, status),
          p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
          p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
        `)
        .or(
          `and(participant_1.eq.${currentUserId},participant_2.eq.${targetUserId}),` +
          `and(participant_1.eq.${targetUserId},participant_2.eq.${currentUserId})`
        )
        .maybeSingle()

      if (existing) {
        setActiveConvo(existing)
        await fetchMessages(existing.id)
        await markAsRead(existing)
      } else {
        const { data: newConvo } = await supabase
          .from('conversations')
          .insert({
            gig_id: gigId || null,
            participant_1: currentUserId,
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

      await fetchConversations()
    }

    window.addEventListener('openChat', handleOpenChat)
    window.addEventListener('openChatWithUser', handleOpenChatWithUser)

    return () => {
      window.removeEventListener('openChat', handleOpenChat)
      window.removeEventListener('openChatWithUser', handleOpenChatWithUser)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
    }
  }, [user])

  useEffect(() => {
    if (activeConvo) {
      fetchMessages(activeConvo.id)
      subscribeToConvoMessages(activeConvo.id)
    }
    return () => {
      if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
    }
  }, [activeConvo?.id])

  useEffect(() => {
    const onMove = (e) => {
      if (!chatDrag.current.on) return
      const t = e.touches?.[0] ?? e
      const dx = t.clientX - chatDrag.current.sx
      const dy = t.clientY - chatDrag.current.sy
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) chatDrag.current.moved = true
      if (!chatDrag.current.moved) return
      e.preventDefault()
      setChatPos({
        right: Math.max(8, Math.min(window.innerWidth - 72, chatDrag.current.sr - dx)),
        bottom: Math.max(8, Math.min(window.innerHeight - 72, chatDrag.current.sb + dy))
      })
    }
    const onEnd = () => { chatDrag.current.on = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }, [messages])

  useEffect(() => {
    if (open && activeConvo) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, activeConvo])

  const fetchConversations = async () => {
    if (!user) return
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        gigs(id, title, pay_min, pay_max, status),
        p1:users!conversations_participant_1_fkey(id, full_name, avatar_url, trust_score),
        p2:users!conversations_participant_2_fkey(id, full_name, avatar_url, trust_score)
      `)
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false })
    if (data) {
      setConversations(data)
      const unread = data.reduce((sum, c) => {
        const count = c.participant_1 === user.id
          ? c.unread_count_1 || 0
          : c.unread_count_2 || 0
        return sum + count
      }, 0)
      setTotalUnread(unread)
    }
  }

  const subscribeToNewMessages = () => {
    if (!user) return
    channelRef.current = supabase
      .channel('floating-chat-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload) => {
        if (payload.new.sender_id === user.id) return
        playMessage()
        setPulse(true)
        setTimeout(() => setPulse(false), 2000)
        fetchConversations()

        if (activeConvo?.id === payload.new.conversation_id) {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          await markAsRead(activeConvo)
        }
      })
      .subscribe()
  }

  const subscribeToConvoMessages = (convoId) => {
    if (convoChannelRef.current) supabase.removeChannel(convoChannelRef.current)
    convoChannelRef.current = supabase
      .channel('float-convo-' + convoId)
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
      })
      .subscribe()
  }

  const fetchMessages = async (convoId) => {
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data)
    setLoadingMsgs(false)
  }

  const markAsRead = async (convo) => {
    if (!convo || !user) return
    const isP1 = convo.participant_1 === user.id
    await supabase
      .from('conversations')
      .update(isP1 ? { unread_count_1: 0 } : { unread_count_2: 0 })
      .eq('id', convo.id)
    fetchConversations()
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvo || sending) return
    setSending(true)
    const text = newMessage.trim()
    setNewMessage('')

    await supabase.from('messages').insert({
      conversation_id: activeConvo.id,
      sender_id: user.id,
      content: text,
      type: 'text'
    })

    const otherUserId = activeConvo.participant_1 === user.id
      ? activeConvo.participant_2
      : activeConvo.participant_1
    const isOtherP1 = activeConvo.participant_1 !== user.id
    const sender = activeConvo.participant_1 === user.id ? activeConvo.p1 : activeConvo.p2
    const senderName = sender?.full_name || user.email?.split('@')[0] || 'Someone'

    await supabase.from('conversations').update({
      last_message: text,
      last_message_at: new Date().toISOString(),
      ...(isOtherP1
        ? { unread_count_1: (activeConvo.unread_count_1 || 0) + 1 }
        : { unread_count_2: (activeConvo.unread_count_2 || 0) + 1 })
    }).eq('id', activeConvo.id)

    await supabase.from('notifications').insert({
      user_id: otherUserId,
      title: `${senderName} sent you a message`,
      message: text.length > 40 ? text.substring(0, 40) + '...' : text,
      type: 'message',
      gig_id: activeConvo.gig_id
    })

    setSending(false)
    fetchConversations()
  }

  const getOtherUser = (convo) => {
    if (!convo || !user) return null
    return convo.participant_1 === user.id ? convo.p2 : convo.p1
  }

  const getUnread = (convo) => {
    if (!convo || !user) return 0
    return convo.participant_1 === user.id
      ? convo.unread_count_1 || 0
      : convo.unread_count_2 || 0
  }

  const timeAgo = (date) => {
    const s = Math.floor((new Date() - new Date(date)) / 1000)
    if (s < 60) return 'now'
    if (s < 3600) return `${Math.floor(s / 60)}m`
    if (s < 86400) return `${Math.floor(s / 3600)}h`
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (date) => new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  })

  return (
    <>
      {/* Floating Button */}
      <div style={{
        position: 'fixed',
        bottom: chatPos.bottom,
        right: chatPos.right,
        zIndex: 8000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px'
      }}>

        {/* Chat Panel */}
        {open && (
          <div style={{
            width: '360px',
            height: '520px',
            background: '#fff',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(108,71,255,0.2)',
            border: '1.5px solid #E2E0FF',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'chatPop 0.25s cubic-bezier(0.16,1,0.3,1)',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
          }}>

            {/* Panel Header */}
            <div style={{
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeConvo && (
                  <button
                    onClick={() => { setActiveConvo(null); setMessages([]) }}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none', borderRadius: '8px',
                      width: '28px', height: '28px',
                      color: '#fff', fontSize: '14px',
                      cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'inherit'
                    }}>←</button>
                )}
                <div>
                  {activeConvo ? (
                    <div
                      onClick={() => setViewingProfile(getOtherUser(activeConvo)?.id)}
                      style={{
                        fontSize: '14px', fontWeight: '700',
                        color: '#fff', cursor: 'pointer'
                      }}>
                      {getOtherUser(activeConvo)?.full_name || 'Chat'}
                    </div>
                  ) : (
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>
                      Messages
                    </div>
                  )}
                  {activeConvo?.gigs && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>
                      Re: {activeConvo.gigs.title}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                {/* Expand to full screen */}
                <button
                  onClick={() => { setOpen(false); onOpenFullChat && onOpenFullChat() }}
                  title="Open full chat"
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none', borderRadius: '8px',
                    width: '28px', height: '28px',
                    color: '#fff', fontSize: '14px',
                    cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit'
                  }}>⤢</button>
                {/* Close */}
                <button
                  onClick={() => setOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none', borderRadius: '8px',
                    width: '28px', height: '28px',
                    color: '#fff', fontSize: '16px',
                    cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit'
                  }}>×</button>
              </div>
            </div>

            {/* Conversation List */}
            {!activeConvo && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {conversations.length === 0 ? (
                  <div style={{
                    padding: '32px 20px', textAlign: 'center'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                      <BrandIcon name="chat" size={56} />
                    </div>
                    <div style={{
                      fontSize: '14px', fontWeight: '600',
                      color: '#14123A', marginBottom: '4px'
                    }}>No messages yet</div>
                    <div style={{ fontSize: '12px', color: '#A09DC8', lineHeight: '1.5' }}>
                      Apply for a gig to start a conversation
                    </div>
                  </div>
                ) : conversations.map(convo => {
                  const other = getOtherUser(convo)
                  const unread = getUnread(convo)
                  return (
                    <div
                      key={convo.id}
                      onClick={() => {
                        setActiveConvo(convo)
                        markAsRead(convo)
                      }}
                      style={{
                        padding: '12px 14px',
                        display: 'flex', gap: '10px',
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderBottom: '1px solid #F5F4FF',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      {/* Avatar */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '12px',
                          background: '#EEE9FF', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '16px', fontWeight: '800',
                          color: '#6C47FF', overflow: 'hidden'
                        }}>
                          {other?.avatar_url ? (
                            <img src={other.avatar_url} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : other?.full_name?.charAt(0) || '?'}
                        </div>
                        <div style={{
                          position: 'absolute', bottom: '-1px', right: '-1px',
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: '#00C48C', border: '2px solid #fff'
                        }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '2px'
                        }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: unread > 0 ? '700' : '600',
                            color: '#14123A',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', flex: 1
                          }}>{other?.full_name || 'Unknown'}</div>
                          <div style={{
                            fontSize: '10px', color: '#A09DC8',
                            flexShrink: 0, marginLeft: '6px'
                          }}>{timeAgo(convo.last_message_at)}</div>
                        </div>
                        {convo.gigs && (
                          <div style={{
                            fontSize: '9px', color: '#6C47FF',
                            fontWeight: '600', marginBottom: '1px',
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>Re: {convo.gigs.title}</div>
                        )}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{
                            fontSize: '11px',
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
                              borderRadius: '50%', width: '18px', height: '18px',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '9px',
                              fontWeight: '800', flexShrink: 0, marginLeft: '4px'
                            }}>{unread > 9 ? '9+' : unread}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Active Conversation Messages */}
            {activeConvo && (
              <>
                <div style={{
                  flex: 1, overflowY: 'auto',
                  padding: '12px 14px',
                  display: 'flex', flexDirection: 'column',
                  gap: '4px', background: '#F8F7FF'
                }}>
                  {loadingMsgs ? (
                    <div style={{
                      textAlign: 'center', padding: '20px',
                      color: '#A09DC8', fontSize: '13px'
                    }}>Loading...</div>
                  ) : messages.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '24px 16px'
                    }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>👋</div>
                      <div style={{
                        fontSize: '13px', fontWeight: '600',
                        color: '#14123A', marginBottom: '3px'
                      }}>Say hello!</div>
                      <div style={{ fontSize: '11px', color: '#A09DC8' }}>
                        Start the conversation
                      </div>
                    </div>
                  ) : messages.map((msg, i) => {
                    const isMe = msg.sender_id === user.id
                    const prevMsg = messages[i - 1]
                    const nextMsg = messages[i + 1]
                    const showTime = !nextMsg ||
                      new Date(nextMsg.created_at) - new Date(msg.created_at) > 300000
                    const isGrouped = prevMsg &&
                      prevMsg.sender_id === msg.sender_id &&
                      new Date(msg.created_at) - new Date(prevMsg.created_at) < 60000

                    return (
                      <div key={msg.id} style={{
                        display: 'flex',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                        marginBottom: isGrouped ? '2px' : '6px',
                        alignItems: 'flex-end', gap: '6px'
                      }}>
                        {!isMe && (
                          <div style={{
                            width: '24px', height: '24px',
                            borderRadius: '7px', background: '#EEE9FF',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '10px',
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

                        <div style={{ maxWidth: '75%' }}>
                          <div style={{
                            background: isMe
                              ? 'linear-gradient(135deg, #6C47FF, #9B59FF)'
                              : '#fff',
                            color: isMe ? '#fff' : '#14123A',
                            borderRadius: isMe
                              ? '16px 16px 4px 16px'
                              : '16px 16px 16px 4px',
                            padding: '8px 12px',
                            fontSize: '13px', lineHeight: '1.5',
                            boxShadow: isMe
                              ? '0 2px 10px rgba(108,71,255,0.3)'
                              : '0 2px 6px rgba(0,0,0,0.06)',
                            border: isMe ? 'none' : '1px solid #E2E0FF',
                            wordBreak: 'break-word'
                          }}>
                            {msg.content}
                          </div>
                          {showTime && (
                            <div style={{
                              fontSize: '9px', color: '#A09DC8',
                              marginTop: '2px',
                              display: 'flex',
                              justifyContent: isMe ? 'flex-end' : 'flex-start',
                              alignItems: 'center', gap: '3px'
                            }}>
                              {formatTime(msg.created_at)}
                              {isMe && (
                                <span style={{
                                  color: msg.read ? '#6C47FF' : '#A09DC8',
                                  fontSize: '10px'
                                }}>
                                  {msg.read ? '✓✓' : '✓'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div style={{
                  padding: '10px 12px',
                  background: '#fff',
                  borderTop: '1.5px solid #E2E0FF',
                  display: 'flex', gap: '8px',
                  alignItems: 'flex-end'
                }}>
                  <input
                    ref={inputRef}
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    placeholder="Message..."
                    style={{
                      flex: 1, background: '#F5F4FF',
                      border: '1.5px solid #E2E0FF',
                      borderRadius: '12px', padding: '9px 13px',
                      fontSize: '13px', color: '#14123A',
                      fontFamily: 'inherit', outline: 'none',
                      transition: 'border-color 0.15s'
                    }}
                    onFocus={e => e.target.style.borderColor = '#B8A5FF'}
                    onBlur={e => e.target.style.borderColor = '#E2E0FF'}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    style={{
                      width: '38px', height: '38px',
                      borderRadius: '11px',
                      background: newMessage.trim()
                        ? 'linear-gradient(135deg, #6C47FF, #9B59FF)'
                        : '#E2E0FF',
                      border: 'none', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', cursor: newMessage.trim() ? 'pointer' : 'default',
                      flexShrink: 0, transition: 'all 0.2s',
                      boxShadow: newMessage.trim()
                        ? '0 3px 12px rgba(108,71,255,0.4)' : 'none'
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
          onMouseDown={(e) => {
            chatDrag.current = { on: true, moved: false, sx: e.clientX, sy: e.clientY, sb: chatPos.bottom, sr: chatPos.right }
          }}
          onTouchStart={(e) => {
            const t = e.touches[0]
            chatDrag.current = { on: true, moved: false, sx: t.clientX, sy: t.clientY, sb: chatPos.bottom, sr: chatPos.right }
          }}
          onClick={() => {
            if (chatDrag.current.moved) { chatDrag.current.moved = false; return }
            setOpen(o => !o)
          }}
          style={{
            width: '56px', height: '56px',
            borderRadius: '50%',
            background: open
              ? '#fff'
              : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
            border: open ? '1.5px solid #E2E0FF' : 'none',
            boxShadow: open
              ? '0 4px 20px rgba(108,71,255,0.2)'
              : '0 4px 24px rgba(108,71,255,0.5)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'grab',
            fontSize: '22px', transition: 'background 0.2s, box-shadow 0.2s',
            animation: pulse ? 'chatBounce 0.5s ease' : 'none',
            position: 'relative', touchAction: 'none',
            userSelect: 'none'
          }}>
          <span style={{
            transform: open ? 'rotate(0deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}>
            {open ? '×' : <BrandIcon name="chat" size={38} />}
          </span>

          {/* Unread badge */}
          {!open && totalUnread > 0 && (
            <div style={{
              position: 'absolute', top: '-2px', right: '-2px',
              background: '#FF3366', color: '#fff',
              borderRadius: '50%',
              width: totalUnread > 9 ? '22px' : '18px',
              height: '18px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              fontSize: '9px', fontWeight: '800',
              border: '2px solid #fff',
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
          <PublicProfile
            userId={viewingProfile}
            onClose={() => setViewingProfile(null)}
          />
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
        @keyframes typingDot {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
