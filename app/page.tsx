'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { callAIAgent, AIAgentResponse } from '@/lib/aiAgent'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { MdHotel, MdRestaurant, MdSpa, MdMeetingRoom, MdRoomService, MdSend, MdContentCopy, MdHistory, MdClose, MdMenu } from 'react-icons/md'
import { HiChatBubbleLeftRight } from 'react-icons/hi2'
import { BsThreeDots } from 'react-icons/bs'

// ============================================================
// TYPES
// ============================================================

interface BookingDetails {
  reference_id: string
  booking_type: string
  status: string
  details: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  bookingDetails?: BookingDetails | null
}

// ============================================================
// CONSTANTS
// ============================================================

const MANAGER_AGENT_ID = '699958767929f75fa2684e49'

const INITIAL_SUGGESTIONS = [
  { label: 'Book a Room', icon: MdHotel, message: 'I would like to book a hotel room.' },
  { label: 'Reserve Dining', icon: MdRestaurant, message: 'I would like to make a dining reservation.' },
  { label: 'Spa Appointment', icon: MdSpa, message: 'I would like to schedule a spa appointment.' },
  { label: 'Conference Room', icon: MdMeetingRoom, message: 'I need to book a conference room.' },
  { label: 'Concierge Services', icon: MdRoomService, message: 'I need concierge assistance.' },
]

const POST_BOOKING_SUGGESTIONS = [
  { label: 'Modify Booking', message: 'I would like to modify my booking.' },
  { label: 'Cancel Booking', message: 'I would like to cancel my booking.' },
  { label: 'New Booking', message: 'I would like to make a new booking.' },
]

// ============================================================
// RESPONSE PARSER
// ============================================================

function parseAgentResponse(result: AIAgentResponse): { text: string; bookingDetails: BookingDetails | null } {
  let text = ''
  let bookingDetails: BookingDetails | null = null

  if (!result.success) {
    return { text: result.error || 'Something went wrong. Please try again.', bookingDetails: null }
  }

  const resp = result.response

  // 1. Check if result.response.result has a "response" field (from JSON schema)
  if (resp?.result?.response) {
    text = typeof resp.result.response === 'string' ? resp.result.response : JSON.stringify(resp.result.response)
  }
  // 2. Check result.response.message
  else if (resp?.message) {
    text = resp.message
  }
  // 3. Check result.response.result as various field names
  else if (resp?.result?.text) {
    text = resp.result.text
  }
  else if (resp?.result?.message) {
    text = resp.result.message
  }
  else if (resp?.result?.answer) {
    text = resp.result.answer
  }
  else if (typeof resp?.result === 'string') {
    try {
      const parsed = JSON.parse(resp.result)
      text = parsed.response || parsed.message || parsed.text || resp.result
      if (parsed.booking_details) {
        bookingDetails = parsed.booking_details
      }
    } catch {
      text = resp.result
    }
  }
  else if (typeof resp === 'string') {
    try {
      const parsed = JSON.parse(resp as unknown as string)
      text = parsed.response || parsed.message || parsed.text || (resp as unknown as string)
    } catch {
      text = resp as unknown as string
    }
  }

  // Try to extract booking_details from result
  if (!bookingDetails && resp?.result?.booking_details) {
    const bd = resp.result.booking_details
    if (bd && bd.reference_id && bd.reference_id !== '' && bd.reference_id !== 'N/A' && bd.reference_id !== 'null') {
      bookingDetails = {
        reference_id: bd.reference_id,
        booking_type: bd.booking_type || '',
        status: bd.status || 'Confirmed',
        details: bd.details || '',
      }
    }
  }

  // Also try parsing text itself for JSON (agent might embed JSON in response)
  if (!bookingDetails && text) {
    try {
      const maybeJson = JSON.parse(text)
      if (maybeJson.booking_details && maybeJson.booking_details.reference_id) {
        bookingDetails = maybeJson.booking_details
        text = maybeJson.response || maybeJson.message || text
      }
    } catch {
      // Not JSON, that is fine
    }
  }

  // Also check raw_response as last resort
  if (!text && result.raw_response) {
    try {
      const rawParsed = JSON.parse(result.raw_response)
      text = rawParsed.response || rawParsed.message || rawParsed.text || result.raw_response
      if (rawParsed.booking_details) {
        bookingDetails = rawParsed.booking_details
      }
    } catch {
      text = result.raw_response
    }
  }

  if (!text) {
    text = 'I received your message but could not parse the response. Please try again.'
  }

  return { text, bookingDetails }
}

// ============================================================
// MARKDOWN RENDERER
// ============================================================

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1.5">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>
      })}
    </div>
  )
}

// ============================================================
// HELPER: BOOKING TYPE ICON
// ============================================================

function getBookingIcon(bookingType: string) {
  const lower = (bookingType || '').toLowerCase()
  if (lower.includes('room') || lower.includes('hotel') || lower.includes('suite') || lower.includes('accommodation')) return MdHotel
  if (lower.includes('din') || lower.includes('restaurant') || lower.includes('meal') || lower.includes('food')) return MdRestaurant
  if (lower.includes('spa') || lower.includes('massage') || lower.includes('wellness')) return MdSpa
  if (lower.includes('conference') || lower.includes('meeting') || lower.includes('event')) return MdMeetingRoom
  return MdRoomService
}

function getStatusColor(status: string) {
  const lower = (status || '').toLowerCase()
  if (lower.includes('confirm')) return 'bg-green-500'
  if (lower.includes('modif') || lower.includes('pending')) return 'bg-amber-500'
  if (lower.includes('cancel')) return 'bg-red-500'
  return 'bg-green-500'
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = (status || '').toLowerCase()
  if (lower.includes('cancel')) return 'destructive'
  if (lower.includes('modif') || lower.includes('pending')) return 'secondary'
  return 'default'
}

// ============================================================
// TIMESTAMP FORMATTER
// ============================================================

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// ERROR BOUNDARY
// ============================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================
// SUB-COMPONENTS (defined as functions, no export)
// ============================================================

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-serif">HC</AvatarFallback>
      </Avatar>
      <div className="bg-card text-card-foreground rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-border/40">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function BookingCard({ booking, onCopy }: { booking: BookingDetails; onCopy: (text: string) => void }) {
  const IconComp = getBookingIcon(booking.booking_type)
  const badgeVariant = getStatusBadgeVariant(booking.status)

  return (
    <Card className="my-2 shadow-md border-border/60 bg-card/80 max-w-md">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <IconComp className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-serif tracking-wide">Booking Confirmation</CardTitle>
          </div>
          <Badge variant={badgeVariant} className="text-xs">{booking.status || 'Confirmed'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-1">
          <div>
            <p className="text-muted-foreground text-xs">Reference ID</p>
            <div className="flex items-center gap-1">
              <p className="font-medium text-foreground truncate">{booking.reference_id}</p>
              <button onClick={() => onCopy(booking.reference_id)} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" aria-label="Copy reference ID">
                <MdContentCopy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Booking Type</p>
            <p className="font-medium text-foreground">{booking.booking_type || '--'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Status</p>
            <p className="font-medium text-foreground">{booking.status || 'Confirmed'}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Details</p>
            <p className="font-medium text-foreground text-xs leading-snug">{booking.details || '--'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SidebarBookingItem({ booking }: { booking: BookingDetails }) {
  const IconComp = getBookingIcon(booking.booking_type)
  const dotColor = getStatusColor(booking.status)

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/60 transition-colors cursor-default">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <IconComp className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{booking.booking_type || 'Booking'}</p>
        <p className="text-xs text-muted-foreground truncate">{booking.reference_id}</p>
      </div>
      <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', dotColor)} />
    </div>
  )
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [bookings, setBookings] = useState<BookingDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const sessionIdRef = useRef<string>('')
  const userIdRef = useRef<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Generate session ID on mount
  useEffect(() => {
    try {
      sessionIdRef.current = crypto.randomUUID()
    } catch {
      sessionIdRef.current = Date.now().toString(36) + Math.random().toString(36).slice(2)
    }
    userIdRef.current = 'guest_' + Date.now().toString(36)
  }, [])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleCopy = useCallback(async (text: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedId(text)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }, [])

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString() + '_user',
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)
    setActiveAgentId(MANAGER_AGENT_ID)

    try {
      const result = await callAIAgent(messageText.trim(), MANAGER_AGENT_ID, {
        user_id: userIdRef.current,
        session_id: sessionIdRef.current,
      })

      const { text, bookingDetails } = parseAgentResponse(result)

      const agentMsg: ChatMessage = {
        id: Date.now().toString() + '_agent',
        role: 'agent',
        content: text,
        timestamp: new Date(),
        bookingDetails: bookingDetails,
      }

      setMessages(prev => [...prev, agentMsg])

      if (bookingDetails) {
        setBookings(prev => [...prev, bookingDetails])
      }
    } catch {
      const errMsg: ChatMessage = {
        id: Date.now().toString() + '_err',
        role: 'agent',
        content: 'An unexpected error occurred. Please try again.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
      setActiveAgentId(null)
    }
  }, [isLoading])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }, [inputValue, sendMessage])

  const hasBookings = bookings.length > 0
  const hasMessages = messages.length > 0
  const suggestionsToShow = hasBookings ? POST_BOOKING_SUGGESTIONS : INITIAL_SUGGESTIONS

  return (
    <ErrorBoundary>
      <div className="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden">
        {/* ============ HEADER ============ */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/30 bg-card/60 backdrop-blur-sm flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Toggle sidebar">
              {sidebarOpen ? <MdClose className="h-5 w-5 text-foreground" /> : <MdMenu className="h-5 w-5 text-foreground" />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <MdHotel className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-serif font-semibold tracking-wide text-foreground leading-tight">HotelConcierge AI</h1>
                <p className="text-xs text-muted-foreground leading-tight">Your personal booking assistant</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 border border-border/30">
              <span className={cn('h-2 w-2 rounded-full', activeAgentId ? 'bg-amber-500 animate-pulse' : 'bg-green-500')} />
              <span className="text-xs text-muted-foreground font-medium">{activeAgentId ? 'Processing' : 'Online'}</span>
            </div>
          </div>
        </header>

        {/* ============ MAIN LAYOUT ============ */}
        <div className="flex flex-1 min-h-0 relative">
          {/* ============ SIDEBAR (Booking History) ============ */}
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
          <aside className={cn(
            'flex-shrink-0 w-72 border-r border-border/30 bg-card/40 flex flex-col z-40 transition-transform duration-200',
            'fixed md:relative inset-y-0 left-0 md:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
            'top-0 md:top-auto pt-14 md:pt-0'
          )}>
            <div className="px-4 py-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                <MdHistory className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-serif font-semibold tracking-wide text-foreground">Booking History</h2>
              </div>
            </div>
            <ScrollArea className="flex-1 px-2 py-2">
              {hasBookings ? (
                <div className="space-y-1">
                  {bookings.map((booking, idx) => (
                    <SidebarBookingItem key={booking.reference_id + '_' + idx} booking={booking} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <MdHistory className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No bookings yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Your booking confirmations will appear here</p>
                </div>
              )}
            </ScrollArea>
            {/* Agent info at bottom of sidebar */}
            <div className="px-3 py-3 border-t border-border/20">
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-secondary/40">
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', activeAgentId === MANAGER_AGENT_ID ? 'bg-amber-500 animate-pulse' : 'bg-green-500')} />
                  <span className="text-xs text-muted-foreground font-medium">Booking Coordinator</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1.5 px-2">Manager agent routes to Room, Dining, Spa, and Activity specialists</p>
            </div>
          </aside>

          {/* ============ CHAT AREA ============ */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="max-w-3xl mx-auto w-full px-4 py-4">
                {!hasMessages ? (
                  /* ============ EMPTY STATE ============ */
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                      <HiChatBubbleLeftRight className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-serif font-semibold tracking-wide text-foreground mb-2">Welcome to HotelConcierge AI</h2>
                    <p className="text-sm text-muted-foreground max-w-md mb-8">Your personal hotel concierge is ready to assist with room bookings, dining reservations, spa appointments, and more. How may I help you today?</p>
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                      {INITIAL_SUGGESTIONS.map((suggestion) => {
                        const IconComp = suggestion.icon
                        return (
                          <Button
                            key={suggestion.label}
                            variant="outline"
                            size="sm"
                            className="rounded-full border-border/60 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 gap-1.5 text-sm font-medium"
                            onClick={() => sendMessage(suggestion.message)}
                            disabled={isLoading}
                          >
                            <IconComp className="h-4 w-4" />
                            {suggestion.label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  /* ============ MESSAGE LIST ============ */
                  <div className="space-y-4 pb-4">
                    {messages.map((msg) => (
                      <div key={msg.id}>
                        {msg.role === 'user' ? (
                          /* User message */
                          <div className="flex justify-end px-2">
                            <div className="max-w-[75%]">
                              <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
                                <p className="text-sm leading-relaxed">{msg.content}</p>
                              </div>
                              <p className="text-[10px] text-muted-foreground/60 text-right mt-1 mr-1">{formatTime(msg.timestamp)}</p>
                            </div>
                          </div>
                        ) : (
                          /* Agent message */
                          <div className="flex items-start gap-3 px-2">
                            <Avatar className="h-8 w-8 flex-shrink-0 border border-border/40 mt-0.5">
                              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-serif">HC</AvatarFallback>
                            </Avatar>
                            <div className="max-w-[75%] min-w-0">
                              <div className="bg-card text-card-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm border border-border/20">
                                {renderMarkdown(msg.content)}
                              </div>
                              {msg.bookingDetails && (
                                <BookingCard booking={msg.bookingDetails} onCopy={handleCopy} />
                              )}
                              <p className="text-[10px] text-muted-foreground/60 mt-1 ml-1">{formatTime(msg.timestamp)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Typing Indicator */}
                    {isLoading && <TypingIndicator />}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* ============ SUGGESTION CHIPS (above input) ============ */}
            {hasMessages && (
              <div className="max-w-3xl mx-auto w-full px-4 pb-1">
                <div className="flex flex-wrap gap-1.5">
                  {suggestionsToShow.map((suggestion) => {
                    const IconComp = 'icon' in suggestion ? (suggestion as typeof INITIAL_SUGGESTIONS[0]).icon : null
                    return (
                      <Button
                        key={suggestion.label}
                        variant="outline"
                        size="sm"
                        className="rounded-full border-border/40 hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 text-xs h-7 px-3"
                        onClick={() => sendMessage(suggestion.message)}
                        disabled={isLoading}
                      >
                        {IconComp && <IconComp className="h-3 w-3 mr-1" />}
                        {suggestion.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ============ INPUT BAR ============ */}
            <div className="border-t border-border/20 bg-card/40 backdrop-blur-sm flex-shrink-0">
              <div className="max-w-3xl mx-auto w-full px-4 py-3">
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Type your booking request..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    className="flex-1 rounded-full bg-background border-border/40 focus-visible:ring-primary/30 text-sm px-4 py-2.5 h-10"
                  />
                  <Button
                    size="icon"
                    className="rounded-full h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200"
                    onClick={() => sendMessage(inputValue)}
                    disabled={isLoading || !inputValue.trim()}
                    aria-label="Send message"
                  >
                    {isLoading ? (
                      <BsThreeDots className="h-4 w-4 animate-pulse" />
                    ) : (
                      <MdSend className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {copiedId && (
                  <p className="text-xs text-muted-foreground mt-1.5 text-center">Reference ID copied to clipboard</p>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
