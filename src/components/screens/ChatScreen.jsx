import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { uploadToR2 } from '../../utils/r2upload'
import PublicProfile from '../PublicProfile'
import BrandIcon from '../BrandIcon'
import { showToast } from '../../utils/toast'
import ScreenLoader from '../ScreenLoader'
import EmptyState from '../EmptyState'
import ReportModal from '../ReportModal'
import ConfirmDialog from '../ConfirmDialog'
import { playMessage } from '../../utils/sounds'
import { sendPushToUser } from '../../utils/pushNotifications'
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
  parseTimestamp,
  sendMessage as sendChatMessage,
  toggleMessageReaction,
  toggleMuteConversation,
  togglePinConversation,
  CHAT_MESSAGE_LIMIT,
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
  /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|heic|heif|avif|bmp|svg)(\?.*)?$/i.test(content)

const isVideoUrl = (content) =>
  /^https?:\/\/.+\.(mp4|mov|avi|webm|mkv|m4v|3gp|ogv)(\?.*)?$/i.test(content)

const isStorageUrl = (content) =>
  typeof content === 'string' && content.startsWith('https://') &&
  (content.includes('supabase.co/storage') || content.includes('.r2.dev/'))

const getAttachmentFilename = (url) => {
  try {
    const seg = decodeURIComponent(url.split('/').pop().split('?')[0])
    const dash = seg.indexOf('-')
    return dash > -1 ? seg.slice(dash + 1) : seg
  } catch { return 'File' }
}

export default function ChatScreen() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [activeConvo, setActiveConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatQuery, setNewChatQuery] = useState('')
  const [newChatUsers, setNewChatUsers] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [startingChatUserId, setStartingChatUserId] = useState(null)
  const [viewingProfile, setViewingProfile] = useState(null)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [conversationMenu, setConversationMenu] = useState(null)
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState(null)
  const [messageMenu, setMessageMenu] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [editedMessageText, setEditedMessageText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [replyingTo, setReplyingTo] = useState(null)
  const [reactingTo, setReactingTo] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [hoveredConvo, setHoveredConvo] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [lightboxImg, setLightboxImg] = useState(null)
  const messagesEndRef = useRef()
  const inputRef = useRef()
  const messagesContainerRef = useRef()
  const preserveScrollRef = useRef(null)
  const fileInputRef = useRef()
  const typingTimeoutRef = useRef()
  const otherTypingTimeoutRef = useRef()
  const messageRequestRef = useRef(0)
  const userSearchRequestRef = useRef(0)
  const channelRef = useRef()
  const conversationChannelRef = useRef([])
  const typingChannelRef = useRef()
  const presenceChannelRef = useRef()
  const longPressTimerRef = useRef()

  useEffect(() => {
    fetchConversations()
  }, [user?.id])

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    const refresh = () => fetchConversations()
    const channels = [
      supabase.channel(`chat-list-p1-${user.id}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `participant_1=eq.${user.id}`
      }, refresh).subscribe(),
      supabase.channel(`chat-list-p2-${user.id}`).on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversations',
        filter: `participant_2=eq.${user.id}`
      }, refresh).subscribe()
    ]
    conversationChannelRef.current = channels
    return () => {
      channels.forEach(channel => supabase.removeChannel(channel))
      conversationChannelRef.current = []
    }
  }, [user?.id])

  useEffect(() => {
    const handleOpenChat = async (e) => {
      const { convoId } = e.detail
      if (!convoId || !user) return

      try {
        const data = await fetchConversationById(convoId, user.id)
        if (data) {
          setActiveConvo(data)
          setConversations(prev =>
            prev.find(c => c.id === data.id) ? prev : [data, ...prev]
          )
        }
      } catch (error) {
        showToast('Could not open this conversation: ' + error.message, 'error')
      }
    }

    const handleOpenChatWithUser = async (e) => {
      const { userId: targetUserId } = e.detail
      if (!targetUserId || !user) return

      try {
        const convo = await getOrCreateConversation({
          currentUser: user,
          targetUserId
        })

        if (convo) {
          setActiveConvo(convo)
          if (convo.id) {
            setConversations(prev =>
              prev.find(c => c.id === convo.id) ? prev : [convo, ...prev]
            )
          }
          if (!convo.id) setMessages([])
        }
      } catch (error) {
        showToast('Could not open conversation: ' + error.message, 'error')
      }
    }

    window.addEventListener('openChat', handleOpenChat)
    window.addEventListener('openChatWithUser', handleOpenChatWithUser)

    // Handle pending mobile navigation (set by FloatingChat before navigating here)
    const pendingUserId = sessionStorage.getItem('pendingChatUserId')
    if (pendingUserId && user) {
      sessionStorage.removeItem('pendingChatUserId')
      sessionStorage.removeItem('pendingChatGigId')
      window.dispatchEvent(new CustomEvent('openChatWithUser', {
        detail: { userId: pendingUserId }
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
    } else {
      setMessages([])
      setHasOlderMessages(false)
    }
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      messageRequestRef.current += 1
    }
  }, [activeConvo?.id])

  useEffect(() => {
    if (!activeConvo?.id || !user?.id) return undefined
    const channel = supabase.channel(`typing-${activeConvo.id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId === user.id) return
        setOtherTyping(Boolean(payload?.typing))
        clearTimeout(otherTypingTimeoutRef.current)
        if (payload?.typing) {
          otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500)
        }
      })
      .subscribe()
    typingChannelRef.current = channel
    setOtherTyping(false)
    return () => {
      clearTimeout(typingTimeoutRef.current)
      clearTimeout(otherTypingTimeoutRef.current)
      if (typingChannelRef.current === channel) typingChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [activeConvo?.id, user?.id])

  useEffect(() => {
    setNewMessage('')
    setReplyingTo(null)
    setShowEmojiPicker(false)
    setShowQuickReplies(false)
    setOtherTyping(false)
  }, [activeConvo?.id])

  useEffect(() => {
    if (!showNewChat || newChatQuery.trim().length < 2 || !user?.id) {
      setNewChatUsers([])
      setSearchingUsers(false)
      return undefined
    }
    const requestId = ++userSearchRequestRef.current
    setSearchingUsers(true)
    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.from('users')
          .select('id, full_name, avatar_url, trust_score')
          .ilike('full_name', `%${newChatQuery.trim()}%`)
          .neq('id', user.id)
          .limit(12)
        if (error) throw error
        if (requestId === userSearchRequestRef.current) setNewChatUsers(data || [])
      } catch (error) {
        if (requestId === userSearchRequestRef.current) {
          setNewChatUsers([])
          showToast('Could not search people: ' + error.message, 'error')
        }
      } finally {
        if (requestId === userSearchRequestRef.current) setSearchingUsers(false)
      }
    }, 250)
    return () => clearTimeout(timeout)
  }, [showNewChat, newChatQuery, user?.id])

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
    const savedScroll = preserveScrollRef.current
    if (savedScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = savedScroll.top + messagesContainerRef.current.scrollHeight - savedScroll.height
      preserveScrollRef.current = null
    } else {
      scrollToBottom()
    }
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
    if (file.size > 10 * 1024 * 1024) { showToast('File must be under 10 MB', 'error'); return }
    setUploadingFile(true)
    try {
      const cleanUrl = await uploadToR2(file, 'chat-attachments')
      await sendMessage(cleanUrl)
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error')
    }
    setUploadingFile(false)
    if (e.target) e.target.value = ''
  }

  async function fetchConversations() {
    if (!user) return
    try {
      const data = await fetchChatConversations(user.id, { includeEmpty: true })
      setConversations(data)
      setActiveConvo(current => current
        ? data.find(item => item.id === current.id) || current
        : current)
    } catch (error) {
      showToast('Could not load messages: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function fetchMessages(convo) {
    const requestId = ++messageRequestRef.current
    setLoadingMessages(true)
    try {
      const data = await fetchChatMessages(convo, user.id)
      if (requestId !== messageRequestRef.current) return
      setMessages(data)
      setHasOlderMessages(data.length === CHAT_MESSAGE_LIMIT)
    } catch (error) {
      if (requestId === messageRequestRef.current) {
        setMessages([])
        setHasOlderMessages(false)
        showToast('Could not load this conversation: ' + error.message, 'error')
      }
    } finally {
      if (requestId === messageRequestRef.current) setLoadingMessages(false)
    }
  }

  async function fetchOlderMessages() {
    if (!activeConvo?.id || !messages.length || loadingOlderMessages || !hasOlderMessages) return
    const oldestMessage = messages[0]
    const container = messagesContainerRef.current
    preserveScrollRef.current = {
      height: container?.scrollHeight || 0,
      top: container?.scrollTop || 0
    }
    setLoadingOlderMessages(true)
    try {
      const older = await fetchChatMessages(activeConvo, user.id, {
        limit: CHAT_MESSAGE_LIMIT,
        before: oldestMessage.created_at
      })
      setHasOlderMessages(older.length === CHAT_MESSAGE_LIMIT)
      if (older.length) {
        setMessages(prev => {
          const currentIds = new Set(prev.map(message => message.id))
          return [...older.filter(message => !currentIds.has(message.id)), ...prev]
        })
      } else preserveScrollRef.current = null
    } catch (error) {
      preserveScrollRef.current = null
      showToast('Could not load older messages: ' + error.message, 'error')
    } finally {
      setLoadingOlderMessages(false)
    }
  }

  function subscribeToMessages(convoId) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel('messages-' + convoId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${convoId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => {
            if (prev.find(m => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          if (payload.new.sender_id !== user.id) {
            if (!isMutedByUser(activeConvo, user.id)) playMessage()
            markAsRead(activeConvo)
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(message => message.id === payload.new.id ? payload.new : message))
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(message => message.id !== payload.old.id))
        }
      })
      .subscribe()
  }

  async function markAsRead(convo) {
    if (!convo) return
    try {
      await markConversationRead(convo, user.id)
      setMessages(prev => prev.map(message => message.conversation_id !== convo.id || message.sender_id === user.id || message.read
        ? message
        : { ...message, read: true, read_at: new Date().toISOString() }))
      setConversations(prev => prev.map(item => item.id === convo.id
        ? { ...item, ...(item.participant_1 === user.id ? { unread_count_1: 0 } : { unread_count_2: 0 }) }
        : item))
    } catch (error) {
      showToast('Could not update read status: ' + error.message, 'error')
    }
  }

  const sendMessage = async (content = newMessage) => {
    if (!content.trim() || !activeConvo || sending) return
    setSending(true)
    const text = content.trim()
    setNewMessage('')
    setShowQuickReplies(false)

    // Show the message immediately before the server responds
    const tempId = 'temp-' + Date.now()
    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConvo.id,
      sender_id: user.id,
      content: text,
      type: 'text',
      created_at: new Date().toISOString(),
      read: false,
      reactions: {},
      reply_to_id: replyingTo?.id || null,
      reply_to_content: replyingTo?.content || null,
      reply_to_sender_name: replyingTo?.senderName || null,
    }
    setMessages(prev => [...prev, optimisticMsg])
    const pendingReply = replyingTo
    setReplyingTo(null)

    try {
      const result = await sendChatMessage({
        user, conversation: activeConvo, content: text, replyTo: pendingReply,
        notifyPush: true, sendPushToUser
      })
      if (result?.conversation?.id && !activeConvo.id) setActiveConvo(result.conversation)
      if (result?.message) {
        // Remove both the temp placeholder AND any realtime-received copy (which may lack reply fields),
        // then insert result.message which has all fields set (including reply metadata).
        setMessages(prev => {
          const without = prev.filter(m => m.id !== tempId && m.id !== result.message.id)
          return [...without, result.message]
        })
      }
      fetchConversations()
    } catch (e) {
      // Roll back the optimistic message and restore the input text
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setNewMessage(text)
      setReplyingTo(pendingReply)
      showToast('Could not send message: ' + e.message, 'error')
    } finally {
      setSending(false)
    }
  }

  const updateConversationPreview = async (convoId, fallbackMessages = messages) => {
    await updateChatConversationPreview(convoId, fallbackMessages)

    fetchConversations()
  }

  const editMessage = (msg) => {
    if (msg.sender_id !== user.id) return
    setEditingMessage(msg)
    setEditedMessageText(msg.content || '')
  }

  const saveMessageEdit = async () => {
    const text = editedMessageText.trim()
    if (!editingMessage || !text || savingEdit) return
    setSavingEdit(true)
    const { error } = await supabase
      .from('messages')
      .update({ content: text })
      .eq('id', editingMessage.id)
      .eq('sender_id', user.id)

    if (error) {
      showToast('Could not edit message: ' + error.message, 'error')
      setSavingEdit(false)
      return
    }

    const nextMessages = messages.map(m => m.id === editingMessage.id ? { ...m, content: text } : m)
    setMessages(nextMessages)
    if (messages[messages.length - 1]?.id === editingMessage.id) {
      await updateConversationPreview(activeConvo.id, nextMessages)
    }
    setEditingMessage(null)
    setEditedMessageText('')
    setSavingEdit(false)
  }

  const deleteMessage = async (msg, confirmed = false) => {
    if (msg.sender_id !== user.id) return
    if (!confirmed) {
      setConfirmDialog({
        title: 'Delete message?', message: 'This message will be removed from the conversation.',
        confirmLabel: 'Delete message', action: () => deleteMessage(msg, true)
      })
      return
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', msg.id)
      .eq('sender_id', user.id)

    if (error) {
      showToast('Could not delete message: ' + error.message, 'error')
      return
    }

    const nextMessages = messages.filter(m => m.id !== msg.id)
    setMessages(nextMessages)
    await updateConversationPreview(activeConvo.id, nextMessages)
  }

  const deleteConversation = async (convo, e, confirmed = false) => {
    e?.stopPropagation()
    if (!convo?.id) {
      setActiveConvo(null)
      setMessages([])
      return
    }
    if (!confirmed) {
      setConfirmDialog({
        title: 'Delete this conversation?', message: 'It will be removed from your inbox. The other person will keep their copy.',
        confirmLabel: 'Delete conversation', action: () => deleteConversation(convo, null, true)
      })
      return
    }

    try {
      await hideConversationForUser(convo, user.id)
    } catch (error) {
      showToast('Could not delete conversation: ' + error.message, 'error')
      return
    }

    setConversations(prev => prev.filter(c => c.id !== convo.id))
    if (activeConvo?.id === convo.id) {
      setActiveConvo(null)
      setMessages([])
    }
  }

  const clearConversation = async (convo, e, confirmed = false) => {
    e?.stopPropagation()
    if (!convo?.id) {
      setActiveConvo(null)
      setMessages([])
      return
    }
    if (!confirmed) {
      setConfirmDialog({
        title: 'Clear this chat?', message: 'Messages will be hidden from your view. The other person will keep their copy.',
        confirmLabel: 'Clear chat', action: () => clearConversation(convo, null, true)
      })
      return
    }

    let now
    try {
      now = await clearConversationForUser(convo, user.id)
    } catch (error) {
      showToast('Could not clear chat: ' + error.message, 'error')
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
    const channel = typingChannelRef.current
    if (channel) channel.send({
      type: 'broadcast', event: 'typing', payload: { userId: user.id, typing: true }
    }).catch(() => {})
    typingTimeoutRef.current = setTimeout(() => {
      const currentChannel = typingChannelRef.current
      if (currentChannel) currentChannel.send({
        type: 'broadcast', event: 'typing', payload: { userId: user.id, typing: false }
      }).catch(() => {})
    }, 2000)
  }

  const startConversationWith = async (person) => {
    setStartingChatUserId(person.id)
    try {
      const convo = await getOrCreateConversation({
        currentUser: user,
        targetUserId: person.id,
        create: true
      })
      setConversations(prev => prev.some(item => item.id === convo.id)
        ? prev
        : [convo, ...prev])
      setActiveConvo(convo)
      setShowNewChat(false)
      setNewChatQuery('')
      setNewChatUsers([])
    } catch (error) {
      showToast('Could not start conversation: ' + error.message, 'error')
    } finally {
      setStartingChatUserId(null)
    }
  }

  const handleReaction = async (msg, emoji) => {
    try {
      const newReactions = await toggleMessageReaction(msg, emoji, user.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: newReactions } : m))
    } catch (err) {
      showToast('Could not react: ' + err.message, 'error')
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
      showToast('Could not forward: ' + err.message, 'error')
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
      showToast('Could not pin: ' + err.message, 'error')
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
      showToast('Could not mute: ' + err.message, 'error')
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
      showToast('Could not mark unread: ' + err.message, 'error')
    }
    setConversationMenu(null)
  }

  const getOtherUser = (convo) => {
    if (!convo || !user) return null
    return getChatOtherUser(convo, user.id)
  }

  const reportConversation = (convo = activeConvo, message = null) => {
    const other = getOtherUser(convo)
    if (!other?.id) {
      showToast('Could not find the person to report', 'error')
      return
    }
    const context = message
      ? `Message ID: ${message.id}\nSent: ${message.created_at}\nMessage: ${String(message.content || '').slice(0, 1200)}`
      : `Conversation ID: ${convo.id}`
    setReportTarget({ userId: other.id, type: message ? 'chat_message' : 'chat', name: message ? 'this message' : 'this conversation', details: context })
    setConversationMenu(null)
    setChatHeaderMenuOpen(false)
    setMessageMenu(null)
  }

  const getUnreadCount = (convo) => {
    if (!convo || !user) return 0
    return getChatUnreadCount(convo, user.id)
  }

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

  // One row per person — deduplicate in case old gig-linked convos exist in DB
  const dedupedConversations = (() => {
    const seen = new Set()
    const byTime = [...conversations].sort((a, b) =>
      parseTimestamp(b.last_message_at || 0) - parseTimestamp(a.last_message_at || 0)
    )
    const result = []
    for (const convo of byTime) {
      const other = getOtherUser(convo)
      if (!other?.id || seen.has(other.id)) continue
      seen.add(other.id)
      result.push(convo)
    }
    return result.sort((a, b) => {
      const ap = isPinnedByUser(a, user?.id) ? 1 : 0
      const bp = isPinnedByUser(b, user?.id) ? 1 : 0
      if (ap !== bp) return bp - ap
      return parseTimestamp(b.last_message_at || 0) - parseTimestamp(a.last_message_at || 0)
    })
  })()
  const visibleConversations = dedupedConversations.filter(convo => {
    const other = getOtherUser(convo)
    const query = conversationSearch.trim().toLowerCase()
    return !query || `${other?.full_name || ''} ${convo.last_message || ''}`.toLowerCase().includes(query)
  })

  const startMsgLongPress = (msgId) => {
    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30)
      setMessageMenu(msgId)
      setReactingTo(null)
    }, 800)
  }
  const cancelMsgLongPress = () => clearTimeout(longPressTimerRef.current)

  const startConvoLongPress = (convoId) => {
    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30)
      setConversationMenu(convoId)
    }, 800)
  }

  return (
    <div className="chat-screen" style={{
      display: 'flex', flex: 1, minHeight: 0,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      overflow: 'hidden'
    }}>

      {/* ── CONVERSATIONS LIST ── */}
      <div style={{
        width: isMobile && activeConvo ? '0' : isMobile ? '100%' : '320px',
        borderRight: '1.5px solid var(--color-border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--color-surface)', flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.3s ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 16px 14px',
          borderBottom: '1.5px solid var(--color-border)'
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{
                fontSize: '20px', fontWeight: '800', color: 'var(--color-text)'
              }}>Messages</div>
              {totalUnread > 0 && (
                <div style={{
                  fontSize: '12px', color: 'var(--color-brand)',
                  fontWeight: '600', marginTop: '2px'
                }}>
                  {totalUnread} unread
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Start a new conversation"
              title="New message"
              onClick={() => setShowNewChat(true)}
              style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'var(--color-brand-soft)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: 0, padding: 0
            }}>
              <BrandIcon name="compose" size={28} active />
            </button>
          </div>
          <input
            type="search"
            value={conversationSearch}
            onChange={event => setConversationSearch(event.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            style={{
              width: '100%', boxSizing: 'border-box', marginTop: '12px',
              padding: '10px 12px', border: 0, borderRadius: '12px',
              outline: 'none', background: 'var(--color-page)',
              color: 'var(--color-text)', font: 'inherit', fontSize: '13px'
            }}
          />
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <ScreenLoader />
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
            visibleConversations.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--color-text-subtle)', fontSize: '13px', textAlign: 'center' }}>
                {conversationSearch ? 'No conversations match your search.' : 'No conversations yet.'}
              </div>
            ) : visibleConversations.map(convo => {
              const other = getOtherUser(convo)
              const unread = getUnreadCount(convo)
              const isActive = activeConvo?.id === convo.id
              const isPinned = isPinnedByUser(convo, user?.id)
              const isMuted = isMutedByUser(convo, user?.id)
              return (
                <div key={convo.id}>
                <div
                  onClick={() => setActiveConvo(convo)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex', gap: '12px',
                    alignItems: 'flex-start',
                    cursor: 'pointer',
                    background: isActive ? 'var(--color-surface-tint)' : 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-page)',
                    transition: 'background 0.1s',
                    position: 'relative',
                    borderLeft: isPinned ? '3px solid var(--color-brand)' : '3px solid transparent'
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-surface-tint)'
                    setHoveredConvo(convo.id)
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-surface)'
                    setHoveredConvo(null)
                  }}
                  onTouchStart={() => startConvoLongPress(convo.id)}
                  onTouchEnd={cancelMsgLongPress}
                  onTouchMove={cancelMsgLongPress}>

                  {/* Avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '13px',
                      background: 'var(--color-brand-soft)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: '800',
                      color: 'var(--color-brand)', overflow: 'hidden'
                    }}>
                      {other?.avatar_url ? (
                        <img src={other.avatar_url} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : other?.full_name?.charAt(0) || '?'}
                    </div>
                    {/* Pin badge */}
                    {isPinned && (
                      <div style={{ position: 'absolute', top: '-5px', left: '-5px' }}>
                        <BrandIcon name="saved" size={16} active tone="var(--color-brand-gradient)" />
                      </div>
                    )}
                    {/* Mute badge */}
                    {isMuted && (
                      <div style={{ position: 'absolute', top: '-5px', right: '-5px' }}>
                        <BrandIcon name="notifications" size={16} active tone="linear-gradient(135deg,var(--color-warning-accent),var(--color-brand-highlight))" />
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: '3px'
                    }}>
                      <div style={{
                        fontSize: '15px', fontWeight: unread > 0 ? '700' : '600',
                        color: 'var(--color-text)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {other?.full_name || 'Unknown'}
                      </div>
                      <div style={{
                        fontSize: '13px', color: 'var(--color-text-subtle)',
                        flexShrink: 0, marginLeft: '8px'
                      }}>
                        {timeAgo(convo.last_message_at)}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: unread > 0 ? 'var(--color-text)' : 'var(--color-text-subtle)',
                        fontWeight: unread > 0 ? '600' : '400',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', flex: 1
                      }}>
                        {isImageUrl(convo.last_message) ? '📷 Photo' : isVideoUrl(convo.last_message) ? '🎥 Video' : isStorageUrl(convo.last_message) ? '📎 File' : (convo.last_message || 'No messages yet')}
                      </div>
                      {unread > 0 && (
                        <div style={{
                          background: 'var(--color-brand)', color: 'var(--color-surface)',
                          borderRadius: '50%', width: '20px', height: '20px',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '12px',
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
                        background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                        color: 'var(--color-brand)', fontSize: '18px', cursor: 'pointer',
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
                        background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                        borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                        zIndex: 10001, minWidth: '175px', overflow: 'hidden'
                      }}>
                        {[
                          {
                            icon: isPinned ? 'unsaved' : 'saved',
                            tone: isPinned ? 'linear-gradient(135deg,var(--color-text-muted),var(--color-text-subtle))' : 'var(--color-brand-gradient)',
                            label: isPinned ? 'Unpin' : 'Pin',
                            color: 'var(--color-text)',
                            action: (e) => handlePinToggle(convo, e)
                          },
                          {
                            icon: isMuted ? 'sound' : 'notifications',
                            tone: isMuted ? 'linear-gradient(135deg,var(--color-success-accent),var(--color-info))' : 'linear-gradient(135deg,var(--color-warning-accent),var(--color-brand-highlight))',
                            label: isMuted ? 'Unmute' : 'Mute',
                            color: 'var(--color-text)',
                            action: (e) => handleMuteToggle(convo, e)
                          },
                          {
                            icon: 'chat',
                            tone: 'linear-gradient(135deg,var(--color-info),var(--color-brand))',
                            label: 'Mark as unread',
                            color: 'var(--color-text)',
                            action: (e) => handleMarkUnread(convo, e)
                          },
                          {
                            icon: 'edit',
                            tone: 'linear-gradient(135deg,var(--color-text-muted),var(--color-text-subtle))',
                            label: 'Clear chat',
                            color: 'var(--color-text)',
                            action: (e) => { clearConversation(convo, e); setConversationMenu(null) }
                          },
                          {
                            icon: 'unsaved',
                            tone: 'linear-gradient(135deg,var(--color-text-muted),var(--color-text-subtle))',
                            label: 'Delete',
                            color: 'var(--color-danger)',
                            action: (e) => { deleteConversation(convo, e); setConversationMenu(null) }
                          },
                          {
                            icon: 'report',
                            tone: 'linear-gradient(135deg,var(--color-danger),var(--color-danger-accent))',
                            label: 'Report conversation',
                            color: 'var(--color-danger)',
                            action: () => reportConversation(convo)
                          },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={(e) => { e.stopPropagation(); item.action(e) }}
                            style={{
                              width: '100%', textAlign: 'left', padding: '10px 14px',
                              border: 'none', background: 'transparent', color: item.color,
                              fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                              borderBottom: '1px solid var(--color-page)',
                              display: 'flex', alignItems: 'center', gap: '10px'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-tint)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <BrandIcon name={item.icon} size={24} active tone={item.tone} />
                            {item.label}
                          </button>
                        ))}
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
        flex: 1, flexDirection: 'column',
        background: 'var(--color-surface-tint)', overflow: 'hidden',
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
              color: 'var(--color-text)', textAlign: 'center'
            }}>Select a conversation</div>
            <div style={{
              fontSize: '13px', color: 'var(--color-text-subtle)',
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
                  background: 'var(--color-surface)',
                  borderBottom: '1.5px solid var(--color-border)',
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
                        color: 'var(--color-brand)', padding: '0',
                        fontFamily: 'inherit'
                      }}>←</button>
                  )}

                  {/* Avatar */}
                  <div
                    onClick={() => setViewingProfile(other?.id)}
                    style={{
                      width: '42px', height: '42px', borderRadius: '12px',
                      background: 'var(--color-brand-soft)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', fontWeight: '800',
                      color: 'var(--color-brand)', overflow: 'hidden',
                      flexShrink: 0, cursor: 'pointer',
                      border: '2px solid var(--color-brand-border-strong)'
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
                        color: 'var(--color-text)', cursor: 'pointer',
                        marginBottom: '2px'
                      }}>
                      {other?.full_name || 'Unknown'}
                    </div>
                    {(() => {
                      const isOtherOnline = onlineUsers.has(other?.id)
                      const trustPart = other?.trust_score != null ? ` · Trust ${other.trust_score}%` : ''
                      return (
                        <div style={{ fontSize: '13px', color: isOtherOnline ? 'var(--color-success)' : 'var(--color-text-subtle)', fontWeight: '600' }}>
                          {isOtherOnline ? 'Online' : 'Offline'}{trustPart}
                        </div>
                      )
                    })()}
                  </div>

                  {activeConvo.id && (
                    <div style={{ position: 'relative' }} className="conversation-menu">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setChatHeaderMenuOpen(prev => !prev)
                        }}
                        style={{
                          marginLeft: 'auto', width: '40px', height: '40px',
                          borderRadius: '50%', border: '1.5px solid var(--color-border)',
                          background: 'var(--color-page)', color: 'var(--color-brand)',
                          cursor: 'pointer', fontSize: '20px', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', padding: 0,
                          fontFamily: 'inherit', zIndex: 10000
                        }}>
                        ⋯
                      </button>
                      {chatHeaderMenuOpen && (
                        <div style={{
                          position: 'absolute', top: '52px', right: '0',
                          background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                          borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                          zIndex: 10001, minWidth: '190px', overflow: 'hidden'
                        }}>
                          {[
                            { label: isPinnedByUser(activeConvo, user?.id) ? 'Unpin chat' : 'Pin chat', run: () => handlePinToggle(activeConvo) },
                            { label: isMutedByUser(activeConvo, user?.id) ? 'Unmute notifications' : 'Mute notifications', run: () => handleMuteToggle(activeConvo) },
                            { label: 'Mark as unread', run: () => handleMarkUnread(activeConvo) },
                            { label: 'Clear chat for me', run: () => clearConversation(activeConvo) },
                            { label: 'Delete conversation', color: 'var(--color-text-muted)', run: () => deleteConversation(activeConvo) },
                            { label: 'Report conversation', color: 'var(--color-danger)', run: () => reportConversation(activeConvo) },
                          ].map(item => (
                            <button key={item.label} onClick={e => { e.stopPropagation(); item.run(); setChatHeaderMenuOpen(false) }} style={{
                              width: '100%', textAlign: 'left', padding: '11px 14px',
                              border: 'none', borderBottom: '1px solid var(--color-page)', background: 'transparent',
                              color: item.color || 'var(--color-text)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
                            }}>{item.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Messages */}
            <div ref={messagesContainerRef} style={{
              flex: 1, overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex', flexDirection: 'column',
              gap: '4px'
            }}>
              {hasOlderMessages && !loadingMessages && (
                <button
                  type="button"
                  onClick={fetchOlderMessages}
                  disabled={loadingOlderMessages}
                  style={{
                    alignSelf: 'center', margin: '0 0 12px', padding: '8px 14px',
                    border: 0, borderRadius: '999px', background: 'var(--color-surface)',
                    color: 'var(--color-brand)', font: 'inherit', fontSize: '12px',
                    fontWeight: '700', cursor: loadingOlderMessages ? 'wait' : 'pointer',
                    boxShadow: '0 4px 14px rgba(38,26,82,0.08)'
                  }}
                >{loadingOlderMessages ? 'Loading…' : 'Load older messages'}</button>
              )}
              {loadingMessages ? (
                <ScreenLoader />
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '16px',
                    background: 'linear-gradient(135deg, var(--color-brand-soft), var(--color-brand-pale))',
                    border: '1.5px solid var(--color-brand-border-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <BrandIcon name="chat" size={36} active />
                  </div>
                  <div style={{
                    fontSize: '14px', fontWeight: '700',
                    color: 'var(--color-text)', marginBottom: '4px'
                  }}>Start the conversation</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)' }}>
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
                      <div key={msg.id} id={`msg-${msg.id}`}>
                        {/* Date divider */}
                        {(!prevMsg ||
                          parseTimestamp(msg.created_at).toDateString() !==
                          parseTimestamp(prevMsg.created_at).toDateString()) && (
                          <div style={{
                            textAlign: 'center', margin: '12px 0',
                            fontSize: '13px', color: 'var(--color-text-subtle)', fontWeight: '600'
                          }}>
                            {parseTimestamp(msg.created_at).toLocaleDateString('en-US', {
                              weekday: 'long', month: 'short', day: 'numeric'
                            })}
                          </div>
                        )}

                        <div
                          onMouseEnter={() => setHoveredMsg(msg.id)}
                          onMouseLeave={() => setHoveredMsg(null)}
                          onTouchStart={() => startMsgLongPress(msg.id)}
                          onTouchEnd={cancelMsgLongPress}
                          onTouchMove={cancelMsgLongPress}
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
                              borderRadius: '8px', background: 'var(--color-brand-soft)',
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '13px',
                              fontWeight: '800', color: 'var(--color-brand)',
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

                          <div style={{ maxWidth: '80%', position: 'relative' }}>
                            {/* Message bubble */}
                            <div style={{
                              background: isMe
                                ? 'var(--color-brand-gradient)'
                                : 'var(--color-surface)',
                              color: isMe ? 'var(--color-surface)' : 'var(--color-text)',
                              borderRadius: isMe
                                ? '18px 18px 4px 18px'
                                : '18px 18px 18px 4px',
                              fontSize: '16px', lineHeight: '1.5',
                              boxShadow: isMe
                                ? '0 2px 12px rgba(108,71,255,0.3)'
                                : '0 2px 8px rgba(0,0,0,0.06)',
                              border: isMe ? 'none' : '1px solid var(--color-border)',
                              wordBreak: 'break-word',
                              padding: (isImageUrl(msg.content) || isVideoUrl(msg.content)) ? '4px' : '10px 14px',
                              overflow: 'hidden'
                            }}>
                              {/* Reply context block */}
                              {msg.reply_to_id && (
                                <div
                                  onClick={() => {
                                    const el = document.getElementById(`msg-${msg.reply_to_id}`)
                                    if (el) {
                                      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      el.style.transition = 'background 0.2s'
                                      el.style.background = 'rgba(108,71,255,0.12)'
                                      setTimeout(() => { el.style.background = '' }, 1200)
                                    }
                                  }}
                                  style={{
                                    background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--color-page)',
                                    borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.6)' : 'var(--color-brand)'}`,
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    marginBottom: '8px',
                                    fontSize: '12px',
                                    opacity: 0.9,
                                    cursor: 'pointer',
                                  }}>
                                  <div style={{ fontWeight: '700', marginBottom: '2px', fontSize: '13px' }}>
                                    {msg.reply_to_sender_name}
                                  </div>
                                  <div style={{
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', maxWidth: '200px'
                                  }}>
                                    {isImageUrl(msg.reply_to_content) ? '📷 Photo' : isVideoUrl(msg.reply_to_content) ? '🎥 Video' : isStorageUrl(msg.reply_to_content) ? '📎 File' : msg.reply_to_content}
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
                                  onClick={() => setLightboxImg(msg.content)}
                                />
                              ) : isVideoUrl(msg.content) ? (
                                <video
                                  src={msg.content}
                                  controls
                                  style={{
                                    maxWidth: '240px', maxHeight: '200px',
                                    borderRadius: '12px', display: 'block'
                                  }}
                                />
                              ) : isStorageUrl(msg.content) ? (
                                <a
                                  href={msg.content}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    color: isMe ? 'var(--color-surface)' : 'var(--color-brand)',
                                    textDecoration: 'none',
                                    padding: '6px 2px'
                                  }}
                                >
                                  <span style={{ fontSize: '22px', flexShrink: 0 }}>📎</span>
                                  <span style={{
                                    textDecoration: 'underline',
                                    wordBreak: 'break-all', fontSize: '13px'
                                  }}>{getAttachmentFilename(msg.content)}</span>
                                </a>
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
                                      background: users.includes(user.id) ? 'var(--color-brand-soft)' : 'var(--color-page)',
                                      border: `1px solid ${users.includes(user.id) ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                                      borderRadius: '12px', padding: '2px 7px',
                                      fontSize: '12px', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: '3px',
                                      fontFamily: 'inherit', color: 'var(--color-text)'
                                    }}>
                                    {emoji} <span style={{ fontSize: '13px', fontWeight: '600' }}>{users.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Inline reaction picker */}
                            {reactingTo === msg.id && (
                              <div className="reaction-picker" style={{
                                position: 'absolute', bottom: '110%',
                                [isMe ? 'right' : 'left']: 0,
                                background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
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
                                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                                  color: 'var(--color-brand)', cursor: 'pointer', fontSize: '16px',
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
                                  background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
                                  borderRadius: '14px', boxShadow: '0 12px 28px rgba(108,71,255,0.15)',
                                  zIndex: 10001, minWidth: '145px', overflow: 'hidden'
                                }}>
                                  {[
                                    {
                                      icon: 'compose',
                                      tone: 'var(--color-brand-gradient)',
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
                                      tone: 'linear-gradient(135deg,var(--color-brand-highlight),var(--color-warning-accent))',
                                      label: 'React',
                                      action: () => {
                                        setReactingTo(msg.id)
                                        setMessageMenu(null)
                                      }
                                    },
                                    {
                                      icon: 'send',
                                      tone: 'linear-gradient(135deg,var(--color-success-accent),var(--color-info))',
                                      label: 'Forward',
                                      action: () => {
                                        setForwardMsg(msg)
                                        setMessageMenu(null)
                                      }
                                    },
                                    ...(isMe && !isStorageUrl(msg.content) && !isImageUrl(msg.content) && !isVideoUrl(msg.content) ? [{
                                      icon: 'edit',
                                      tone: 'var(--color-brand-gradient)',
                                      label: 'Edit',
                                      action: () => { editMessage(msg); setMessageMenu(null) }
                                    }, {
                                      icon: 'unsaved',
                                      tone: 'linear-gradient(135deg,var(--color-text-muted),var(--color-text-subtle))',
                                      label: 'Delete',
                                      color: 'var(--color-danger)',
                                      action: () => { deleteMessage(msg); setMessageMenu(null) }
                                    }] : []),
                                    ...(!isMe ? [{
                                      icon: 'report', tone: 'linear-gradient(135deg,var(--color-danger-accent),var(--color-warning-accent))',
                                      label: 'Report message', color: 'var(--color-danger)',
                                      action: () => reportConversation(activeConvo, msg)
                                    }] : [])
                                  ].map(item => (
                                    <button
                                      key={item.label}
                                      onClick={(e) => { e.stopPropagation(); item.action() }}
                                      style={{
                                        width: '100%', textAlign: 'left', padding: '10px 12px',
                                        border: 'none', background: 'transparent',
                                        color: item.color || 'var(--color-text)',
                                        fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                                        borderBottom: '1px solid var(--color-page)',
                                        display: 'flex', alignItems: 'center', gap: '10px'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-tint)'}
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
                                fontSize: '12px', color: 'var(--color-text-subtle)',
                                marginTop: '3px', fontWeight: '500',
                                textAlign: isMe ? 'right' : 'left',
                                display: 'flex',
                                justifyContent: isMe ? 'flex-end' : 'flex-start',
                                alignItems: 'center', gap: '4px'
                              }}>
                                {formatTime(msg.created_at)}
                                {isMe && (
                                  <span style={{
                                    color: msg.read ? 'var(--color-brand)' : 'var(--color-text-subtle)',
                                    fontSize: '13px'
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
                        background: 'var(--color-brand-soft)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: '800', color: 'var(--color-brand)'
                      }}>
                        {getOtherUser(activeConvo)?.full_name?.charAt(0) || '?'}
                      </div>
                      <div style={{
                        background: 'var(--color-surface)', borderRadius: '18px 18px 18px 4px',
                        padding: '12px 16px',
                        border: 'none',
                        boxShadow: 'var(--shadow-glass)',
                        display: 'flex', alignItems: 'center',
                        color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: '600'
                      }}>
                        Typing…
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
                background: 'var(--color-surface)',
                borderTop: '1px solid var(--color-page)'
              }}>
                {QUICK_REPLIES.map(reply => (
                  <button
                    key={reply}
                    onClick={() => sendMessage(reply)}
                    style={{
                      background: 'var(--color-brand-soft)', border: '1.5px solid var(--color-brand-border-strong)',
                      borderRadius: '20px', padding: '6px 13px',
                      fontSize: '12px', fontWeight: '600',
                      color: 'var(--color-brand)', cursor: 'pointer',
                      whiteSpace: 'nowrap', fontFamily: 'inherit',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--color-brand)'
                      e.currentTarget.style.color = 'var(--color-surface)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--color-brand-soft)'
                      e.currentTarget.style.color = 'var(--color-brand)'
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
                background: 'var(--color-surface)',
                borderTop: '1px solid var(--color-page)',
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
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-page)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{emoji}</button>
                ))}
              </div>
            )}

            {/* Reply toolbar */}
            {replyingTo && (
              <div style={{
                padding: '8px 16px',
                background: 'var(--color-page)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: 'var(--color-brand)', fontWeight: '700', marginBottom: '2px' }}>
                    Replying to {replyingTo.senderName}
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--color-text-subtle)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {replyingTo.content}
                  </div>
                </div>
                <button 
                  onClick={() => setReplyingTo(null)}
                  style={{
                    background: 'none', border: 'none', fontSize: '18px',
                    cursor: 'pointer', color: 'var(--color-text-subtle)', padding: '4px',
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
              background: 'var(--color-surface)',
              borderTop: '1.5px solid var(--color-border)',
              display: 'flex', gap: '8px',
              alignItems: 'flex-end', flexShrink: 0
            }}>
              {/* Quick replies toggle */}
              <button
                title="Quick replies"
                onClick={() => { setShowQuickReplies(q => !q); setShowEmojiPicker(false) }}
                style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: showQuickReplies ? 'var(--color-brand-soft)' : 'var(--color-page)',
                  border: `1.5px solid ${showQuickReplies ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
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
                  background: showEmojiPicker ? 'var(--color-brand-soft)' : 'var(--color-page)',
                  border: `1.5px solid ${showEmojiPicker ? 'var(--color-brand-border-strong)' : 'var(--color-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, padding: 0
                }}>
                <BrandIcon name="creative" size={28} active={showEmojiPicker} tone="linear-gradient(135deg,var(--color-brand-highlight),var(--color-warning-accent))" />
              </button>

              {/* Attachment button */}
              <button
                title="Attach image or file"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                style={{
                  width: '38px', height: '38px', borderRadius: '11px',
                  background: 'var(--color-page)', border: '1.5px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: uploadingFile ? 'not-allowed' : 'pointer',
                  flexShrink: 0, padding: 0,
                  opacity: uploadingFile ? 0.5 : 1
                }}>
                <BrandIcon name="applied" size={28} active={!uploadingFile} tone="linear-gradient(135deg,var(--color-info),var(--color-brand))" />
              </button>

              {/* Input */}
              <div style={{
                flex: 1, background: 'var(--color-page)',
                border: '1.5px solid var(--color-border)',
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
                    outline: 'none', fontSize: '14px', color: 'var(--color-text)',
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
                    ? 'var(--color-brand-gradient)'
                    : 'var(--color-border)',
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

      {/* New conversation */}
      {showNewChat && (
        <div
          role="presentation"
          onClick={() => setShowNewChat(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 20000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', background: 'rgba(20,18,58,0.48)', backdropFilter: 'blur(6px)'
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-chat-title"
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(100%, 460px)', maxHeight: 'min(80vh, 620px)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRadius: '20px', background: 'var(--color-surface)',
              boxShadow: '0 24px 70px rgba(20,18,58,0.25)'
            }}
          >
            <div style={{ padding: '20px 20px 14px' }}>
              <div id="new-chat-title" style={{ fontSize: '18px', fontWeight: '800', color: 'var(--color-text)' }}>New message</div>
              <input
                autoFocus
                type="search"
                value={newChatQuery}
                onChange={event => setNewChatQuery(event.target.value)}
                placeholder="Search people by name"
                aria-label="Search people by name"
                style={{
                  width: '100%', boxSizing: 'border-box', marginTop: '14px', padding: '12px 14px',
                  border: 0, borderRadius: '12px', outline: 'none',
                  background: 'var(--color-page)', color: 'var(--color-text)', font: 'inherit'
                }}
              />
            </div>
            <div style={{ minHeight: '140px', overflowY: 'auto', padding: '0 12px 12px' }}>
              {newChatQuery.trim().length < 2 ? (
                <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '13px' }}>Type at least 2 characters to search.</div>
              ) : searchingUsers ? (
                <ScreenLoader />
              ) : newChatUsers.length === 0 ? (
                <div style={{ padding: '22px 12px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '13px' }}>No people found.</div>
              ) : newChatUsers.map(person => (
                <button
                  key={person.id}
                  type="button"
                  disabled={Boolean(startingChatUserId)}
                  onClick={() => startConversationWith(person)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px', border: 0, borderRadius: '12px', background: 'transparent',
                    textAlign: 'left', cursor: startingChatUserId ? 'wait' : 'pointer', font: 'inherit'
                  }}
                >
                  <span style={{
                    width: '42px', height: '42px', display: 'grid', placeItems: 'center',
                    flexShrink: 0, overflow: 'hidden', borderRadius: '13px',
                    background: 'var(--color-brand-soft)', color: 'var(--color-brand)', fontWeight: '800'
                  }}>
                    {person.avatar_url ? <img src={person.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : person.full_name?.charAt(0) || '?'}
                  </span>
                  <span style={{ color: 'var(--color-text)', fontSize: '14px', fontWeight: '700' }}>{person.full_name || 'Prima member'}</span>
                  {startingChatUserId === person.id && <span style={{ marginLeft: 'auto', color: 'var(--color-text-subtle)', fontSize: '12px' }}>Opening…</span>}
                </button>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-page)' }}>
              <button type="button" onClick={() => setShowNewChat(false)} style={{
                width: '100%', minHeight: '42px', border: 0, borderRadius: '12px',
                background: 'var(--color-page)', color: 'var(--color-text-muted)',
                font: 'inherit', fontWeight: '700', cursor: 'pointer'
              }}>Cancel</button>
            </div>
          </section>
        </div>
      )}

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
              background: 'var(--color-surface)', borderRadius: '20px',
              boxShadow: '0 24px 60px rgba(108,71,255,0.2)',
              width: '340px', maxWidth: '90vw', overflow: 'hidden'
            }}>
            <div style={{ padding: '18px 20px', borderBottom: '1.5px solid var(--color-border)' }}>
              <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-text)', marginBottom: '4px' }}>
                Forward message
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--color-text-subtle)',
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
                      borderBottom: '1px solid var(--color-page)',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-tint)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--color-surface)'}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'var(--color-brand-soft)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: '14px', fontWeight: '800',
                      color: 'var(--color-brand)', overflow: 'hidden', flexShrink: 0
                    }}>
                      {other?.avatar_url
                        ? <img src={other.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : other?.full_name?.charAt(0) || '?'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text)' }}>
                      {other?.full_name || 'Unknown'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1.5px solid var(--color-border)' }}>
              <button
                onClick={() => setForwardMsg(null)}
                style={{
                  width: '100%', padding: '10px', borderRadius: '12px',
                  border: '1.5px solid var(--color-border)', background: 'var(--color-page)',
                  color: 'var(--color-text-subtle)', fontFamily: 'inherit', fontSize: '13px',
                  fontWeight: '600', cursor: 'pointer'
                }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImg && (
        <div
          onClick={() => setLightboxImg(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={lightboxImg}
            alt="attachment"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '95vw', maxHeight: '90vh',
              borderRadius: '12px', objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
          <button 
            onClick={() => setLightboxImg(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: 'var(--color-surface)', fontSize: '20px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
          <a
            href={lightboxImg}
            download
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: '24px',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '20px', padding: '8px 20px',
              color: 'var(--color-surface)', fontSize: '13px', fontWeight: '600',
              textDecoration: 'none',
            }}
          >⬇ Download</a>
        </div>
      )}

      {reportTarget && (
        <ReportModal
          onClose={() => setReportTarget(null)}
          reportedUserId={reportTarget.userId}
          type={reportTarget.type}
          name={reportTarget.name}
          initialDetails={reportTarget.details}
          notifyReportedUser={false}
        />
      )}

      {editingMessage && (
        <div onClick={() => !savingEdit && setEditingMessage(null)} style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          background: 'linear-gradient(135deg, rgba(89,53,232,0.58), rgba(30,27,75,0.68))',
          backdropFilter: 'blur(7px)'
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="edit-message-title" onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: '480px', padding: '24px', borderRadius: '22px',
            background: 'var(--color-brand-surface-gradient)',
            boxShadow: '0 20px 60px rgba(30,27,75,0.28), var(--shadow-glass)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '1.2px', color: 'var(--color-brand)', textTransform: 'uppercase', marginBottom: '6px' }}>Edit message</div>
            <h2 id="edit-message-title" style={{ color: 'var(--color-text)', fontSize: '20px', marginBottom: '16px' }}>Update your message</h2>
            <textarea
              autoFocus
              value={editedMessageText}
              onChange={e => setEditedMessageText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && !savingEdit) setEditingMessage(null) }}
              aria-label="Message text"
              style={{
                width: '100%', minHeight: '120px', resize: 'vertical', padding: '13px 14px',
                borderRadius: '14px', border: '1px solid var(--color-brand-border-strong)',
                background: 'var(--color-brand-tint)', color: 'var(--color-text)',
                font: 'inherit', outline: 'none', lineHeight: '1.5'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" disabled={savingEdit} onClick={() => setEditingMessage(null)} style={{
                minHeight: '44px', padding: '0 18px', borderRadius: '12px',
                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                color: 'var(--color-text-muted)', font: 'inherit', fontWeight: '700', cursor: 'pointer'
              }}>Cancel</button>
              <button type="button" disabled={!editedMessageText.trim() || savingEdit} onClick={saveMessageEdit} style={{
                minHeight: '44px', padding: '0 20px', borderRadius: '12px', border: 'none',
                background: !editedMessageText.trim() || savingEdit ? 'var(--color-brand-border-strong)' : 'var(--color-brand-gradient)',
                color: 'white', font: 'inherit', fontWeight: '700', cursor: !editedMessageText.trim() || savingEdit ? 'wait' : 'pointer',
                boxShadow: '0 5px 16px rgba(108,71,255,0.22)'
              }}>{savingEdit ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => { const action = confirmDialog.action; setConfirmDialog(null); action() }}
        />
      )}

    </div>
  )
}
