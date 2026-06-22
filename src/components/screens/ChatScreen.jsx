import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import EmptyState from '../EmptyState'
import { playMessage } from '../../utils/sounds'
import {
  clearConversationForUser,
  fetchConversationById,
  fetchConversations as fetchChatConversations,
  fetchMessages as fetchChatMessages,
  getOrCreateConversation,
  getOtherUser as getChatOtherUser,
  getUnreadCount as getChatUnreadCount,
  hideConversationForUser,
  isPinnedByUser,
  isMutedByUser,
  markConversationRead,
  markConversationUnread,
  markMessageRead,
  parseTimestamp,
  sendMessage as sendChatMessage,
  toggleMessageReaction,
  toggleMuteConversation,
  togglePinConversation,
  updateConversationPreview as updateChatConversationPreview
} from '../../utils/chat'

const QUICK_REPLIES = [
  'On my way! 🚀',
  'Running 10 mins late',
  'Payment sent ✓',
  'Work completed!',
  'Can we reschedule?',
  'Sounds good 👍',
]

const COMMON_EMOJIS = [
  '😊','😂','❤️','👍','🎉','🙏','😍','🔥','✅','👏',
  '😭','🤔','💪','🚀','✨','😅','🙌','💯','🤝','😎',
  '⭐','🎯','💡','👋','😁','🥳','💰','🎊','👀','🤣',
  '💥','🏆','🎁','💬','☕','🎵','💎','😤','🫂','🌟',
]

const isImageUrl = (content) =>
  /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|heic|svg)(\?.*)?$/i.test(content)

export default function ChatScreen() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [, setTyping] = useState(false)
  const [otherTyping] = useState(false)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [conversationMenu, setConversationMenu] = useState(null)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)
  const [messageMenu, setMessageMenu] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [reactingTo, setReactingTo] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [hoveredConvo, setHoveredConvo] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const messagesEndRef = useRef()
  const inputRef = useRef()
  const fileInputRef = useRef()
  const typingTimeoutRef = useRef()
  const channelRef = useRef()
  const presenceChannelRef = useRef()

  useEffect(() => {
    fetchConversations()
  }, [user])

  useEffect(() => {
    const handleOpenChat = async (e) => {
      const { convoId } = e.detail
      if (!convoId || !user) return

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
      if (!targetUserId || !user) return

      const convo = await getOrCreateConversation({
        currentUser: user,
        targetUserId,
        gigId: gigId || null
      })

      if (convo) {
        setActiveConvo(convo)
        if (convo.id && convo.last_message) {
          setConversations(prev =>
            prev.find(c => c.id === convo.id) ? prev : [convo, ...prev]
          )
        }
        if (!convo.id) setMessages([])
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
    if (activeConvo?.id) {
      fetchMessages(activeConvo)
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
    const handleClickOutside = (event) => {
      if (!event.target.closest('.conversation-menu') && !event.target.closest('.message-menu') && !event.target.closest('.reaction-picker')) {
        setConversationMenu(null)
        setChatHeaderMenuOpen(false)
        setMessageMenu(null)
        setReactingTo(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Supabase Realtime Presence — track who's online
  useEffect(() => {
    if (!user?.id) return

    const extractIds = (state) => {
      const ids = new Set()
      Object.values(state).forEach(list => list.forEach(p => { if (p.user_id) ids.add(p.user_id) }))
      return ids
    }

    const ch = supabase.channel('prima-presence')
      .on('presence', { event: 'sync' }, () => setOnlineUsers(extractIds(ch.presenceState())))
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
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: user.id })
        }
      })

    presenceChannelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [user?.id])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleFileAttach = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !activeConvo) return
    if (file.size > 10 * 1024 * 1024) { alert('File must be under 10 MB'); return }
    setUploadingFile(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { upsert: false })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('chat-attachments').getPublicUrl(path)
      await sendMessage(urlData.publicUrl)
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    setUploadingFile(false)
    if (e.target) e.target.value = ''
  }

  async function fetchConversations() {
    if (!user) return
    try {
      const data = await fetchChatConversations(user.id)
      setConversations(data)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages(convo) {
    setLoadingMessages(true)
    try {
      const data = await fetchChatMessages(convo, user.id)
      setMessages(data)
    } finally {
      setLoadingMessages(false)
    }
  }

  function subscribeToMessages(convoId) {
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

  async function markAsRead(convo) {
    if (!convo) return
    await markConversationRead(convo, user.id)
    fetchConversations()
  }

  const sendMessage = async (content = newMessage) => {
    if (!content.trim() || !activeConvo || sending) return
    setSending(true)
    const text = content.trim()
    setNewMessage('')
    setShowQuickReplies(false)
    try {
      const result = await sendChatMessage({ user, conversation: activeConvo, content: text, replyTo: replyingTo })
      setReplyingTo(null)
      if (result?.conversation?.id && !activeConvo.id) setActiveConvo(result.conversation)
      if (result?.message) {
        setMessages(prev =>
          prev.find(m => m.id === result.message.id) ? prev : [...prev, result.message]
        )
      }
      await fetchConversations()
    } catch (e) {
      alert('Could not send message: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  const updateConversationPreview = async (convoId, fallbackMessages = messages) => {
    await updateChatConversationPreview(convoId, fallbackMessages)

    fetchConversations()
  }

  const editMessage = async (msg) => {
    if (msg.sender_id !== user.id) return
    const next = window.prompt('Edit message', msg.content)
    if (next === null) return
    const text = next.trim()
    if (!text) return

    const { error } = await supabase
      .from('messages')
      .update({ content: text })
      .eq('id', msg.id)
      .eq('sender_id', user.id)

    if (error) {
      alert('Could not edit message: ' + error.message)
      return
    }

    const nextMessages = messages.map(m => m.id === msg.id ? { ...m, content: text } : m)
    setMessages(nextMessages)
    if (messages[messages.length - 1]?.id === msg.id) {
      await updateConversationPreview(activeConvo.id, nextMessages)
    }
  }

  const deleteMessage = async (msg) => {
    if (msg.sender_id !== user.id) return
    if (!window.confirm('Delete this message?')) return

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', msg.id)
      .eq('sender_id', user.id)

    if (error) {
      alert('Could not delete message: ' + error.message)
      return
    }

    const nextMessages = messages.filter(m => m.id !== msg.id)
    setMessages(nextMessages)
    await updateConversationPreview(activeConvo.id, nextMessages)
  }

  const deleteConversation = async (convo, e) => {
    e?.stopPropagation()
    if (!convo?.id) {
      setActiveConvo(null)
      setMessages([])
      return
    }
    if (!window.confirm('Delete this conversation from your inbox? The other person will keep their copy.')) return

    try {
      await hideConversationForUser(convo, user.id)
    } catch (error) {
      alert('Could not delete conversation: ' + error.message)
      return
    }

    setConversations(prev => prev.filter(c => c.id !== convo.id))
    if (activeConvo?.id === convo.id) {
      setActiveConvo(null)
      setMessages([])
    }
  }

  const clearConversation = async (convo, e) => {
    e?.stopPropagation()
    if (!convo?.id) {
      setActiveConvo(null)
      setMessages([])
      return
    }
    if (!window.confirm('Clear this chat for you?')) return

    let now
    try {
      now = await clearConversationForUser(convo, user.id)
    } catch (error) {
      alert('Could not clear chat: ' + error.message)
      return
    }

    setConversations(prev => prev.map(c =>
      c.id === convo.id
        ? {
          ...c,
          ...(c.participant_1 === user.id
            ? { cleared_at_1: now, unread_count_1: 0 }
            : { cleared_at_2: now, unread_count_2: 0 })
        }
        : c
    ))
    if (activeConvo?.id === convo.id) {
      setActiveConvo(prev => prev
        ? {
          ...prev,
          ...(prev.participant_1 === user.id
            ? { cleared_at_1: now, unread_count_1: 0 }
            : { cleared_at_2: now, unread_count_2: 0 })
        }
        : prev)
      setMessages([])
    }
  }

  const handleTyping = () => {
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(false)
    }, 2000)
    setTyping(true)
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

  const handleForward = async (targetConvoId) => {
    if (!forwardMsg || !targetConvoId) { setForwardMsg(null); return }
    const targetConvo = conversations.find(c => c.id === targetConvoId)
    if (!targetConvo) { setForwardMsg(null); return }
    try {
      await sendChatMessage({ user, conversation: targetConvo, content: forwardMsg.content })
      await fetchConversations()
    } catch (err) {
      alert('Could not forward: ' + err.message)
    }
    setForwardMsg(null)
  }

  const handlePinToggle = async (convo, e) => {
    e?.stopPropagation()
    try {
      const newVal = await togglePinConversation(convo, user.id)
      const field = convo.participant_1 === user.id ? 'pinned_1' : 'pinned_2'
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, [field]: newVal } : c))
      if (activeConvo?.id === convo.id)
        setActiveConvo(prev => prev ? { ...prev, [field]: newVal } : prev)
    } catch (err) {
      alert('Could not pin: ' + err.message)
    }
    setConversationMenu(null)
  }

  const handleMuteToggle = async (convo, e) => {
    e?.stopPropagation()
    try {
      const newVal = await toggleMuteConversation(convo, user.id)
      const field = convo.participant_1 === user.id ? 'muted_1' : 'muted_2'
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, [field]: newVal } : c))
      if (activeConvo?.id === convo.id)
        setActiveConvo(prev => prev ? { ...prev, [field]: newVal } : prev)
    } catch (err) {
      alert('Could not mute: ' + err.message)
    }
    setConversationMenu(null)
  }

  const handleMarkUnread = async (convo, e) => {
    e?.stopPropagation()
    try {
      await markConversationUnread(convo, user.id)
      const field = convo.participant_1 === user.id ? 'unread_count_1' : 'unread_count_2'
      setConversations(prev => prev.map(c => c.id === convo.id ? { ...c, [field]: 1 } : c))
    } catch (err) {
      alert('Could not mark unread: ' + err.message)
    }
    setConversationMenu(null)
  }

  const getOtherUser = (convo) => {
    if (!convo || !user) return null
    return getChatOtherUser(convo, user.id)
  }

  const getUnreadCount = (convo) => {
    if (!convo || !user) return 0
    return getChatUnreadCount(convo, user.id)
  }

  void editMessage

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - parseTimestamp(date)) / 1000)
    if (seconds < 60) return 'now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return parseTimestamp(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTime = (date) => {
    return parseTimestamp(date).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit'
    })
  }

  const totalUnread = conversations.reduce((sum, c) => sum + getUnreadCount(c), 0)

  const sortedConversations = [...conversations].sort((a, b) => {
    const aPinned = isPinnedByUser(a, user?.id) ? 1 : 0
    const bPinned = isPinnedByUser(b, user?.id) ? 1 : 0
    return bPinned - aPinned
  })

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
            sortedConversations.map(convo => {
              const other = getOtherUser(convo)
              const unread = getUnreadCount(convo)
              const isActive = activeConvo?.id === convo.id
              const isPinned = isPinnedByUser(convo, user?.id)
              const isMuted = isMutedByUser(convo, user?.id)
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
                    position: 'relative',
                    borderLeft: isPinned ? '3px solid #6C47FF' : '3px solid transparent'
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = '#F8F7FF'
                    setHoveredConvo(convo.id)
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = '#fff'
                    setHoveredConvo(null)
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
                      background: onlineUsers.has(other?.id) ? '#00C48C' : '#CBD5E1',
                      border: '2px solid #fff',
                      transition: 'background 0.3s'
                    }} />
                    {/* Pin badge */}
                    {isPinned && (
                      <div style={{ position: 'absolute', top: '-5px', left: '-5px' }}>
                        <BrandIcon name="saved" size={16} active tone="linear-gradient(135deg,#6C47FF,#9B59FF)" />
                      </div>
                    )}
                    {/* Mute badge */}
                    {isMuted && (
                      <div style={{ position: 'absolute', top: '-5px', right: '-5px' }}>
                        <BrandIcon name="notifications" size={16} active tone="linear-gradient(135deg,#FF6B2B,#FF4DCF)" />
                      </div>
                    )}
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
                  <div style={{ position: 'relative' }} className="conversation-menu">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConversationMenu(prev => prev === convo.id ? null : convo.id)
                      }}
                      style={{
                        position: 'absolute', top: '14px', right: '14px',
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                        color: '#6C47FF', fontSize: '18px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 0, zIndex: 10000,
                        opacity: (hoveredConvo === convo.id || conversationMenu === convo.id) ? 1 : 0,
                        pointerEvents: (hoveredConvo === convo.id || conversationMenu === convo.id) ? 'auto' : 'none',
                        transition: 'opacity 0.15s'
                      }}>
                      ⋯
                    </button>
                    {conversationMenu === convo.id && (
                      <div style={{
                        position: 'absolute', top: '48px', right: '0',
                        background: '#fff', border: '1.5px solid #E2E0FF',
                        borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                        zIndex: 10001, minWidth: '175px', overflow: 'hidden'
                      }}>
                        {[
                          {
                            icon: isPinned ? 'unsaved' : 'saved',
                            tone: isPinned ? 'linear-gradient(135deg,#8B8FAF,#A09DC8)' : 'linear-gradient(135deg,#6C47FF,#9B59FF)',
                            label: isPinned ? 'Unpin' : 'Pin',
                            color: '#14123A',
                            action: (e) => handlePinToggle(convo, e)
                          },
                          {
                            icon: isMuted ? 'sound' : 'notifications',
                            tone: isMuted ? 'linear-gradient(135deg,#00C48C,#0EA5E9)' : 'linear-gradient(135deg,#FF6B2B,#FF4DCF)',
                            label: isMuted ? 'Unmute' : 'Mute',
                            color: '#14123A',
                            action: (e) => handleMuteToggle(convo, e)
                          },
                          {
                            icon: 'chat',
                            tone: 'linear-gradient(135deg,#0EA5E9,#6C47FF)',
                            label: 'Mark as unread',
                            color: '#14123A',
                            action: (e) => handleMarkUnread(convo, e)
                          },
                          {
                            icon: 'edit',
                            tone: 'linear-gradient(135deg,#8B8FAF,#A09DC8)',
                            label: 'Clear chat',
                            color: '#14123A',
                            action: (e) => { clearConversation(convo, e); setConversationMenu(null) }
                          },
                          {
                            icon: 'unsaved',
                            tone: 'linear-gradient(135deg,#FF3366,#FF6B2B)',
                            label: 'Delete',
                            color: '#FF3366',
                            action: (e) => { deleteConversation(convo, e); setConversationMenu(null) }
                          },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={(e) => { e.stopPropagation(); item.action(e) }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '10px 14px',
                              border: 'none', background: 'transparent', color: item.color,
                              fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                              borderBottom: '1px solid #F5F4FF',
                              display: 'flex', alignItems: 'center', gap: '10px'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <BrandIcon name={item.icon} size={24} active tone={item.tone} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── CHAT WINDOW ── */}
      <div style={{
        flex: 1, flexDirection: 'column',
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
                    {(() => {
                      const isOtherOnline = onlineUsers.has(other?.id)
                      const trustPart = other?.trust_score != null ? ` · Trust ${other.trust_score}%` : ''
                      return (
                        <div style={{ fontSize: '11px', color: isOtherOnline ? '#00C48C' : '#A09DC8', fontWeight: '600' }}>
                          {isOtherOnline ? '🟢 Online' : '⚫ Offline'}{trustPart}
                        </div>
                      )
                    })()}
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

                  {activeConvo.id && (
                    <div style={{ position: 'relative' }} className="conversation-menu">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setChatHeaderMenuOpen(prev => !prev)
                        }}
                        style={{
                          marginLeft: 'auto', width: '40px', height: '40px',
                          borderRadius: '50%', border: '1.5px solid #E2E0FF',
                          background: '#F5F4FF', color: '#6C47FF',
                          cursor: 'pointer', fontSize: '20px', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', padding: 0,
                          fontFamily: 'inherit', zIndex: 10000
                        }}>
                        ⋯
                      </button>
                      {chatHeaderMenuOpen && (
                        <div style={{
                          position: 'absolute', top: '52px', right: '0',
                          background: '#fff', border: '1.5px solid #E2E0FF',
                          borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                          zIndex: 10001, minWidth: '160px', overflow: 'hidden'
                        }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              clearConversation(activeConvo, e)
                              setChatHeaderMenuOpen(false)
                            }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '12px 14px',
                              border: 'none', background: 'transparent', color: '#14123A',
                              fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
                            }}>
                            Clear chat
                          </button>
                        </div>
                      )}
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
                      parseTimestamp(nextMsg.created_at) - parseTimestamp(msg.created_at) > 300000
                    const isGrouped = prevMsg &&
                      prevMsg.sender_id === msg.sender_id &&
                      parseTimestamp(msg.created_at) - parseTimestamp(prevMsg.created_at) < 60000

                    return (
                      <div key={msg.id}>
                        {/* Date divider */}
                        {(!prevMsg ||
                          parseTimestamp(msg.created_at).toDateString() !==
                          parseTimestamp(prevMsg.created_at).toDateString()) && (
                          <div style={{
                            textAlign: 'center', margin: '12px 0',
                            fontSize: '11px', color: '#A09DC8', fontWeight: '600'
                          }}>
                            {parseTimestamp(msg.created_at).toLocaleDateString('en-US', {
                              weekday: 'long', month: 'short', day: 'numeric'
                            })}
                          </div>
                        )}

                        <div
                          onMouseEnter={() => setHoveredMsg(msg.id)}
                          onMouseLeave={() => setHoveredMsg(null)}
                          style={{
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

                          <div style={{ maxWidth: '70%', position: 'relative' }}>
                            {/* Message bubble */}
                            <div style={{
                              background: isMe
                                ? 'linear-gradient(135deg, #6C47FF, #9B59FF)'
                                : '#fff',
                              color: isMe ? '#fff' : '#14123A',
                              borderRadius: isMe
                                ? '18px 18px 4px 18px'
                                : '18px 18px 18px 4px',
                              fontSize: '14px', lineHeight: '1.5',
                              boxShadow: isMe
                                ? '0 2px 12px rgba(108,71,255,0.3)'
                                : '0 2px 8px rgba(0,0,0,0.06)',
                              border: isMe ? 'none' : '1px solid #E2E0FF',
                              wordBreak: 'break-word',
                              padding: isImageUrl(msg.content) ? '4px' : '10px 14px',
                              overflow: 'hidden'
                            }}>
                              {/* Reply context block */}
                              {msg.reply_to_id && (
                                <div style={{
                                  background: isMe ? 'rgba(255,255,255,0.15)' : '#F5F4FF',
                                  borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.6)' : '#6C47FF'}`,
                                  borderRadius: '6px',
                                  padding: '6px 10px',
                                  marginBottom: '8px',
                                  fontSize: '12px',
                                  opacity: 0.9
                                }}>
                                  <div style={{ fontWeight: '700', marginBottom: '2px', fontSize: '11px' }}>
                                    {msg.reply_to_sender_name}
                                  </div>
                                  <div style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', maxWidth: '200px'
                                  }}>
                                    {msg.reply_to_content}
                                  </div>
                                </div>
                              )}
                              {isImageUrl(msg.content) ? (
                                <img
                                  src={msg.content}
                                  alt="attachment"
                                  style={{
                                    maxWidth: '240px', maxHeight: '240px',
                                    borderRadius: '12px', display: 'block',
                                    objectFit: 'cover', cursor: 'pointer'
                                  }}
                                  onClick={() => window.open(msg.content, '_blank')}
                                />
                              ) : msg.content}
                            </div>

                            {/* Reactions display */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '4px',
                                marginTop: '4px',
                                justifyContent: isMe ? 'flex-end' : 'flex-start'
                              }}>
                                {Object.entries(msg.reactions).map(([emoji, users]) => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg, emoji)}
                                    style={{
                                      background: users.includes(user.id) ? '#EEE9FF' : '#F5F4FF',
                                      border: `1px solid ${users.includes(user.id) ? '#B8A5FF' : '#E2E0FF'}`,
                                      borderRadius: '12px', padding: '2px 7px',
                                      fontSize: '12px', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '3px',
                                      fontFamily: 'inherit', color: '#14123A'
                                    }}>
                                    {emoji} <span style={{ fontSize: '11px', fontWeight: '600' }}>{users.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Inline reaction picker */}
                            {reactingTo === msg.id && (
                              <div className="reaction-picker" style={{
                                position: 'absolute', bottom: '110%',
                                [isMe ? 'right' : 'left']: 0,
                                background: '#fff', border: '1.5px solid #E2E0FF',
                                borderRadius: '28px', padding: '6px 10px',
                                boxShadow: '0 8px 24px rgba(108,71,255,0.18)',
                                display: 'flex', gap: '4px', zIndex: 10002
                              }}>
                                {['❤️','😂','😍','👍','😢','😡'].map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => handleReaction(msg, emoji)}
                                    style={{
                                      fontSize: '20px', background: 'none', border: 'none',
                                      cursor: 'pointer', borderRadius: '8px', padding: '4px',
                                      lineHeight: 1, transition: 'transform 0.1s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                  >{emoji}</button>
                                ))}
                              </div>
                            )}

                            {/* Message ⋯ menu — visible on all messages */}
                            <div
                              style={{
                                position: 'absolute', top: '8px',
                                [isMe ? 'left' : 'right']: '-34px',
                                zIndex: 10000
                              }}
                              className="message-menu">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMessageMenu(prev => prev === msg.id ? null : msg.id)
                                  setReactingTo(null)
                                }}
                                style={{
                                  width: '26px', height: '26px', borderRadius: '50%',
                                  border: '1px solid #E2E0FF', background: '#fff',
                                  color: '#6C47FF', cursor: 'pointer', fontSize: '16px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  padding: 0,
                                  opacity: (hoveredMsg === msg.id || messageMenu === msg.id) ? 1 : 0,
                                  pointerEvents: (hoveredMsg === msg.id || messageMenu === msg.id) ? 'auto' : 'none',
                                  transition: 'opacity 0.15s'
                                }}>
                                ⋯
                              </button>
                              {messageMenu === msg.id && (
                                <div style={{
                                  position: 'absolute', top: '32px',
                                  [isMe ? 'left' : 'right']: '0',
                                  background: '#fff', border: '1.5px solid #E2E0FF',
                                  borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                                  zIndex: 10001, minWidth: '145px', overflow: 'hidden'
                                }}>
                                  {[
                                    {
                                      icon: 'compose',
                                      tone: 'linear-gradient(135deg,#6C47FF,#9B59FF)',
                                      label: 'Reply',
                                      action: () => {
                                        const other = getOtherUser(activeConvo)
                                        setReplyingTo({
                                          id: msg.id,
                                          content: msg.content,
                                          senderName: isMe ? 'You' : (other?.full_name || 'Them')
                                        })
                                        setMessageMenu(null)
                                        inputRef.current?.focus()
                                      }
                                    },
                                    {
                                      icon: 'suggest',
                                      tone: 'linear-gradient(135deg,#FF4DCF,#FF6B2B)',
                                      label: 'React',
                                      action: () => {
                                        setReactingTo(msg.id)
                                        setMessageMenu(null)
                                      }
                                    },
                                    {
                                      icon: 'send',
                                      tone: 'linear-gradient(135deg,#00C48C,#0EA5E9)',
                                      label: 'Forward',
                                      action: () => {
                                        setForwardMsg(msg)
                                        setMessageMenu(null)
                                      }
                                    },
                                    ...(isMe ? [{
                                      icon: 'unsaved',
                                      tone: 'linear-gradient(135deg,#FF3366,#FF6B2B)',
                                      label: 'Delete',
                                      color: '#FF3366',
                                      action: () => { deleteMessage(msg); setMessageMenu(null) }
                                    }] : [])
                                  ].map(item => (
                                    <button
                                      key={item.label}
                                      onClick={(e) => { e.stopPropagation(); item.action() }}
                                      style={{
                                        width: '100%', textAlign: 'left', padding: '10px 12px',
                                        border: 'none', background: 'transparent',
                                        color: item.color || '#14123A',
                                        fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                                        borderBottom: '1px solid #F5F4FF',
                                        display: 'flex', alignItems: 'center', gap: '10px'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                      <BrandIcon name={item.icon} size={24} active tone={item.tone} />
                                      {item.label}
                                    </button>
                                  ))}
                                </div>
                              )}
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

            {/* Emoji Picker */}
            {showEmojiPicker && (
              <div style={{
                padding: '10px 14px',
                background: '#fff',
                borderTop: '1px solid #F5F4FF',
                display: 'flex', flexWrap: 'wrap', gap: '4px'
              }}>
                {COMMON_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setNewMessage(m => m + emoji)
                      inputRef.current?.focus()
                    }}
                    style={{
                      fontSize: '22px', background: 'none', border: 'none',
                      cursor: 'pointer', borderRadius: '8px', padding: '4px 6px',
                      lineHeight: 1, transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F5F4FF'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{emoji}</button>
                ))}
              </div>
            )}

            {/* Reply toolbar */}
            {replyingTo && (
              <div style={{
                padding: '8px 16px',
                background: '#F5F4FF',
                borderTop: '1px solid #E2E0FF',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', color: '#6C47FF', fontWeight: '700', marginBottom: '2px' }}>
                    Replying to {replyingTo.senderName}
                  </div>
                  <div style={{
                    fontSize: '12px', color: '#A09DC8',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {replyingTo.content}
                  </div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  style={{
                    background: 'none', border: 'none', fontSize: '18px',
                    cursor: 'pointer', color: '#A09DC8', padding: '4px',
                    lineHeight: 1
                  }}>✕</button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={handleFileAttach}
            />

            {/* Message Input */}
            <div style={{
              padding: '12px 16px',
              background: '#fff',
              borderTop: '1.5px solid #E2E0FF',
              display: 'flex', gap: '8px',
              alignItems: 'flex-end', flexShrink: 0
            }}>
              {/* Quick replies toggle */}
              <button
                title="Quick replies"
                onClick={() => { setShowQuickReplies(q => !q); setShowEmojiPicker(false) }}
                style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: showQuickReplies ? '#EEE9FF' : '#F5F4FF',
                  border: `1.5px solid ${showQuickReplies ? '#B8A5FF' : '#E2E0FF'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit'
                }}>
                <BrandIcon name="suggest" size={24} active={showQuickReplies} />
              </button>

              {/* Emoji button */}
              <button
                title="Emoji"
                onClick={() => { setShowEmojiPicker(e => !e); setShowQuickReplies(false) }}
                style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: showEmojiPicker ? '#EEE9FF' : '#F5F4FF',
                  border: `1.5px solid ${showEmojiPicker ? '#B8A5FF' : '#E2E0FF'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: 0
                }}>
                <BrandIcon name="creative" size={28} active={showEmojiPicker} tone="linear-gradient(135deg,#FF4DCF,#FF6B2B)" />
              </button>

              {/* Attachment button */}
              <button
                title="Attach image or file"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: '#F5F4FF', border: '1.5px solid #E2E0FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: uploadingFile ? 'not-allowed' : 'pointer',
                  flexShrink: 0, padding: 0,
                  opacity: uploadingFile ? 0.5 : 1
                }}>
                <BrandIcon name="applied" size={28} active={!uploadingFile} tone="linear-gradient(135deg,#0EA5E9,#6C47FF)" />
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

      {/* Forward modal */}
      {forwardMsg && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(20,18,58,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20000
        }} onClick={() => setForwardMsg(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '20px',
              boxShadow: '0 24px 60px rgba(108,71,255,0.2)',
              width: '340px', maxWidth: '90vw', overflow: 'hidden'
            }}>
            <div style={{ padding: '18px 20px', borderBottom: '1.5px solid #E2E0FF' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#14123A', marginBottom: '4px' }}>
                Forward message
              </div>
              <div style={{
                fontSize: '12px', color: '#A09DC8',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                "{forwardMsg.content}"
              </div>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {conversations.filter(c => c.id !== activeConvo?.id).map(convo => {
                const other = getOtherUser(convo)
                return (
                  <div
                    key={convo.id}
                    onClick={() => handleForward(convo.id)}
                    style={{
                      padding: '12px 20px', display: 'flex', gap: '12px',
                      alignItems: 'center', cursor: 'pointer',
                      borderBottom: '1px solid #F5F4FF',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8F7FF'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: '#EEE9FF', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '14px', fontWeight: '800',
                      color: '#6C47FF', overflow: 'hidden', flexShrink: 0
                    }}>
                      {other?.avatar_url
                        ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : other?.full_name?.charAt(0) || '?'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#14123A' }}>
                      {other?.full_name || 'Unknown'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1.5px solid #E2E0FF' }}>
              <button
                onClick={() => setForwardMsg(null)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '12px',
                  border: '1.5px solid #E2E0FF', background: '#F5F4FF',
                  color: '#A09DC8', fontFamily: 'inherit', fontSize: '13px',
                  fontWeight: '600', cursor: 'pointer'
                }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
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
