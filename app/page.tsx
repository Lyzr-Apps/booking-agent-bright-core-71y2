'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MdMic, MdMicOff, MdHotel, MdCallEnd } from 'react-icons/md'
import { HiPhone } from 'react-icons/hi2'
import { BsSoundwave } from 'react-icons/bs'

// ============================================================
// CONSTANTS
// ============================================================

const AGENT_ID = '699958767929f75fa2684e49'
const VOICE_API = 'https://voice-sip.studio.lyzr.ai/session/start'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

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
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
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
// VOICE VISUALIZATION RINGS
// ============================================================

function VoiceRings({ audioLevel, isActive, isSpeaking }: { audioLevel: number; isActive: boolean; isSpeaking: boolean }) {
  const ringCount = 4
  const rings = Array.from({ length: ringCount }, (_, i) => i)

  return (
    <>
      {rings.map((i) => {
        const baseScale = 1 + (i + 1) * 0.18
        const levelBoost = isActive ? audioLevel * (0.12 + i * 0.06) : 0
        const scale = baseScale + levelBoost
        const baseOpacity = isActive ? 0.25 - i * 0.05 : 0.08
        const levelOpacity = isActive ? audioLevel * (0.2 - i * 0.04) : 0

        return (
          <div
            key={i}
            className={cn(
              'absolute inset-0 rounded-full transition-all',
              isSpeaking ? 'border-accent/40' : 'border-primary/40',
              isActive ? 'duration-150' : 'duration-700'
            )}
            style={{
              transform: `scale(${scale})`,
              opacity: baseOpacity + levelOpacity,
              borderWidth: '2px',
              borderStyle: 'solid',
              borderColor: isSpeaking
                ? 'hsl(43 75% 38% / 0.4)'
                : 'hsl(27 61% 26% / 0.35)',
            }}
          />
        )
      })}
    </>
  )
}

// ============================================================
// TRANSCRIPT BUBBLE
// ============================================================

function TranscriptBubble({ role, text }: { role: 'user' | 'agent'; text: string }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] px-4 py-2.5 rounded-2xl shadow-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-card text-card-foreground rounded-bl-sm border border-border/30'
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed">{text}</p>
        ) : (
          renderMarkdown(text)
        )}
      </div>
    </div>
  )
}

// ============================================================
// STATUS BADGE
// ============================================================

function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const config: Record<ConnectionStatus, { label: string; dotClass: string; badgeClass: string }> = {
    idle: { label: 'Ready', dotClass: 'bg-muted-foreground/50', badgeClass: 'bg-secondary/60 text-muted-foreground border-border/30' },
    connecting: { label: 'Connecting', dotClass: 'bg-amber-500 animate-pulse', badgeClass: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
    connected: { label: 'Connected', dotClass: 'bg-green-500', badgeClass: 'bg-green-500/10 text-green-700 border-green-500/30' },
    error: { label: 'Error', dotClass: 'bg-red-500', badgeClass: 'bg-red-500/10 text-red-700 border-red-500/30' },
  }
  const c = config[status]

  return (
    <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium', c.badgeClass)}>
      <span className={cn('h-2 w-2 rounded-full flex-shrink-0', c.dotClass)} />
      {c.label}
    </div>
  )
}

// ============================================================
// SUGGESTION CHIPS
// ============================================================

const SUGGESTIONS = [
  'Book a room',
  'Reserve dining',
  'Spa appointment',
  'Conference room',
  'Concierge services',
]

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================

export default function Page() {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([])
  const [currentThinking, setCurrentThinking] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [callDuration, setCallDuration] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sampleRateRef = useRef<number>(24000)
  const isMutedRef = useRef(false)

  // Audio playback queue
  const nextPlayTimeRef = useRef<number>(0)
  const playbackContextRef = useRef<AudioContext | null>(null)

  // Analyser for visualizer
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  // Call timer
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callStartRef = useRef<number>(0)

  // Transcript scroll
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // Keep mute ref in sync
  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, currentThinking])

  // Convert Float32 to PCM16 base64
  const float32ToPcm16Base64 = useCallback((float32Array: Float32Array): string => {
    const pcm16 = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    const bytes = new Uint8Array(pcm16.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }, [])

  // Resample audio to target sample rate
  const resample = useCallback(async (
    audioData: Float32Array,
    fromSampleRate: number,
    toSampleRate: number
  ): Promise<Float32Array> => {
    if (fromSampleRate === toSampleRate) return audioData
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil((audioData.length * toSampleRate) / fromSampleRate),
      toSampleRate
    )
    const buffer = offlineCtx.createBuffer(1, audioData.length, fromSampleRate)
    buffer.getChannelData(0).set(audioData)
    const source = offlineCtx.createBufferSource()
    source.buffer = buffer
    source.connect(offlineCtx.destination)
    source.start()
    const rendered = await offlineCtx.startRendering()
    return rendered.getChannelData(0)
  }, [])

  // Play received audio chunk -- QUEUED sequentially
  const playAudioChunk = useCallback((base64Audio: string) => {
    try {
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioContext({ sampleRate: sampleRateRef.current })
      }
      const ctx = playbackContextRef.current

      const binaryStr = atob(base64Audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      const pcm16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 0x8000
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRateRef.current)
      audioBuffer.getChannelData(0).set(float32)

      const sourceNode = ctx.createBufferSource()
      sourceNode.buffer = audioBuffer
      sourceNode.connect(ctx.destination)

      const now = ctx.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      sourceNode.start(startTime)
      nextPlayTimeRef.current = startTime + audioBuffer.duration

      setIsSpeaking(true)
      sourceNode.onended = () => {
        if (ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
          setIsSpeaking(false)
        }
      }
    } catch (err) {
      console.error('Audio playback error:', err)
    }
  }, [])

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    analyserRef.current = null
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
  }, [])

  // Start voice session
  const startSession = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setTranscript([])
    setCurrentThinking('')
    setCallDuration(0)
    setIsMuted(false)
    isMutedRef.current = false

    try {
      // 1. Start session via REST API
      const res = await fetch(VOICE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID }),
      })

      if (!res.ok) {
        throw new Error(`Session start failed: ${res.status}`)
      }

      const data = await res.json()
      const wsUrl = data.wsUrl
      sampleRateRef.current = data.audioConfig?.sampleRate || 24000

      if (!wsUrl) throw new Error('No wsUrl in response')

      // 2. Create playback context
      if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
        playbackContextRef.current.close()
      }
      playbackContextRef.current = new AudioContext({ sampleRate: sampleRateRef.current })
      nextPlayTimeRef.current = 0

      // 3. Connect WebSocket
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = async () => {
        setStatus('connected')

        // Start call timer
        callStartRef.current = Date.now()
        callTimerRef.current = setInterval(() => {
          setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000))
        }, 1000)

        // 4. Request mic access and start streaming
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: { ideal: sampleRateRef.current },
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
          streamRef.current = stream

          const audioContext = new AudioContext({ sampleRate: sampleRateRef.current })
          audioContextRef.current = audioContext

          const source = audioContext.createMediaStreamSource(stream)

          // Analyser for visualization
          const analyser = audioContext.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)
          analyserRef.current = analyser

          // ScriptProcessor -- connect to silent gain node, NOT destination
          const processor = audioContext.createScriptProcessor(4096, 1, 1)
          processorRef.current = processor

          const silentGain = audioContext.createGain()
          silentGain.gain.value = 0
          silentGain.connect(audioContext.destination)

          source.connect(processor)
          processor.connect(silentGain) // silent -- no echo

          processor.onaudioprocess = async (e) => {
            if (ws.readyState !== WebSocket.OPEN) return
            if (isMutedRef.current) return
            const inputData = e.inputBuffer.getChannelData(0)
            const resampled = await resample(
              new Float32Array(inputData),
              audioContext.sampleRate,
              sampleRateRef.current
            )
            const base64 = float32ToPcm16Base64(resampled)
            ws.send(JSON.stringify({
              type: 'audio',
              audio: base64,
              sampleRate: sampleRateRef.current,
            }))
          }

          setIsListening(true)

          // Audio level animation
          const updateLevel = () => {
            if (!analyserRef.current) return
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
            analyserRef.current.getByteFrequencyData(dataArray)
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
            setAudioLevel(isMutedRef.current ? 0 : avg / 255)
            animFrameRef.current = requestAnimationFrame(updateLevel)
          }
          updateLevel()
        } catch {
          setError('Microphone access denied. Please allow microphone access to use voice.')
          setStatus('error')
        }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          switch (msg.type) {
            case 'audio':
              if (msg.audio) {
                playAudioChunk(msg.audio)
              }
              break

            case 'transcript':
              if (msg.role === 'user' && msg.text) {
                setTranscript(prev => {
                  const last = prev[prev.length - 1]
                  if (last && last.role === 'user') {
                    return [...prev.slice(0, -1), { role: 'user' as const, text: msg.text }]
                  }
                  return [...prev, { role: 'user' as const, text: msg.text }]
                })
              } else if (msg.role === 'agent' && msg.text) {
                setTranscript(prev => {
                  const last = prev[prev.length - 1]
                  if (last && last.role === 'agent') {
                    return [...prev.slice(0, -1), { role: 'agent' as const, text: msg.text }]
                  }
                  return [...prev, { role: 'agent' as const, text: msg.text }]
                })
              }
              break

            case 'thinking':
              setCurrentThinking(msg.text || 'Processing...')
              break

            case 'clear':
              nextPlayTimeRef.current = 0
              setIsSpeaking(false)
              setCurrentThinking('')
              break

            case 'error':
              setError(msg.message || 'Voice agent error')
              break

            default:
              break
          }
        } catch {
          // Non-JSON message, ignore
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        setStatus('error')
      }

      ws.onclose = () => {
        setStatus('idle')
        setIsListening(false)
        setIsSpeaking(false)
        cleanup()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
      setStatus('error')
    }
  }, [float32ToPcm16Base64, resample, playAudioChunk, cleanup])

  // End session
  const endSession = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    cleanup()
    setStatus('idle')
    setIsListening(false)
    setIsSpeaking(false)
    setCurrentThinking('')
    setAudioLevel(0)
  }, [cleanup])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      cleanup()
      if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
        playbackContextRef.current.close()
      }
    }
  }, [cleanup])

  // Format call duration
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const isConnected = status === 'connected'
  const isIdle = status === 'idle'
  const isConnecting = status === 'connecting'
  const hasTranscript = transcript.length > 0

  return (
    <ErrorBoundary>
      <div className="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden">

        {/* ============ HEADER ============ */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/20 bg-card/50 backdrop-blur-sm flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <MdHotel className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-serif font-semibold tracking-wide text-foreground leading-tight">HotelConcierge AI</h1>
              <p className="text-xs text-muted-foreground leading-tight">Voice-powered concierge</p>
            </div>
          </div>
          <ConnectionStatusBadge status={status} />
        </header>

        {/* ============ MAIN CONTENT ============ */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* ============ VOICE INTERFACE AREA ============ */}
          <div className="flex flex-col items-center justify-center px-4 pt-6 pb-4 md:pt-10 md:pb-6 flex-shrink-0">

            {/* Central Voice Button */}
            <div className="relative flex items-center justify-center">
              {/* Animated rings */}
              <div className="absolute h-32 w-32 md:h-40 md:w-40">
                <VoiceRings
                  audioLevel={audioLevel}
                  isActive={isConnected && isListening}
                  isSpeaking={isSpeaking}
                />
              </div>

              {/* Outer glow when connected */}
              {isConnected && (
                <div
                  className="absolute rounded-full transition-all duration-500"
                  style={{
                    width: '180px',
                    height: '180px',
                    background: isSpeaking
                      ? 'radial-gradient(circle, hsl(43 75% 38% / 0.08) 0%, transparent 70%)'
                      : 'radial-gradient(circle, hsl(27 61% 26% / 0.08) 0%, transparent 70%)',
                  }}
                />
              )}

              {/* Main mic button */}
              <button
                onClick={isIdle || status === 'error' ? startSession : isConnected ? endSession : undefined}
                disabled={isConnecting}
                className={cn(
                  'relative z-10 h-24 w-24 md:h-32 md:w-32 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg',
                  isIdle && 'bg-primary hover:bg-primary/90 hover:shadow-xl hover:scale-105 cursor-pointer',
                  isConnecting && 'bg-primary/70 cursor-wait animate-pulse',
                  isConnected && !isSpeaking && 'bg-primary shadow-xl cursor-pointer',
                  isConnected && isSpeaking && 'bg-accent shadow-xl shadow-accent/20 cursor-pointer',
                  status === 'error' && 'bg-destructive/80 hover:bg-destructive cursor-pointer',
                )}
                aria-label={isIdle ? 'Start voice call' : isConnected ? 'End voice call' : 'Connecting'}
              >
                {isIdle && (
                  <HiPhone className="h-10 w-10 md:h-12 md:w-12 text-primary-foreground" />
                )}
                {isConnecting && (
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary-foreground/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block h-2 w-2 rounded-full bg-primary-foreground/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block h-2 w-2 rounded-full bg-primary-foreground/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                {isConnected && !isSpeaking && (
                  <BsSoundwave className="h-10 w-10 md:h-12 md:w-12 text-primary-foreground" />
                )}
                {isConnected && isSpeaking && (
                  <BsSoundwave className="h-10 w-10 md:h-12 md:w-12 text-accent-foreground animate-pulse" />
                )}
                {status === 'error' && (
                  <HiPhone className="h-10 w-10 md:h-12 md:w-12 text-destructive-foreground" />
                )}
              </button>
            </div>

            {/* Status text below button */}
            <div className="mt-5 text-center min-h-[3rem]">
              {isIdle && (
                <div>
                  <p className="text-base font-serif font-medium text-foreground">Tap to Connect</p>
                  <p className="text-xs text-muted-foreground mt-1">Speak with your personal hotel concierge</p>
                </div>
              )}
              {isConnecting && (
                <div>
                  <p className="text-base font-serif font-medium text-foreground">Connecting...</p>
                  <p className="text-xs text-muted-foreground mt-1">Setting up your concierge line</p>
                </div>
              )}
              {isConnected && !isSpeaking && !currentThinking && (
                <div>
                  <p className="text-base font-serif font-medium text-foreground">Listening</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDuration(callDuration)}</p>
                </div>
              )}
              {isConnected && isSpeaking && (
                <div>
                  <p className="text-base font-serif font-medium text-accent-foreground">Concierge is speaking...</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDuration(callDuration)}</p>
                </div>
              )}
              {isConnected && currentThinking && !isSpeaking && (
                <div>
                  <p className="text-base font-serif font-medium text-foreground">{currentThinking}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDuration(callDuration)}</p>
                </div>
              )}
              {status === 'error' && (
                <div>
                  <p className="text-base font-serif font-medium text-destructive">Connection Error</p>
                  <p className="text-xs text-muted-foreground mt-1">Tap to retry</p>
                </div>
              )}
            </div>

            {/* Call controls (mute / end call) -- only when connected */}
            {isConnected && (
              <div className="flex items-center gap-4 mt-4">
                <button
                  onClick={toggleMute}
                  className={cn(
                    'h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-md',
                    isMuted
                      ? 'bg-destructive/20 text-destructive border border-destructive/30'
                      : 'bg-card text-foreground border border-border/40 hover:bg-secondary'
                  )}
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? (
                    <MdMicOff className="h-5 w-5" />
                  ) : (
                    <MdMic className="h-5 w-5" />
                  )}
                </button>
                <button
                  onClick={endSession}
                  className="h-12 w-12 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-all duration-200"
                  aria-label="End call"
                >
                  <MdCallEnd className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>

          {/* ============ ERROR DISPLAY ============ */}
          {error && (
            <div className="mx-4 md:mx-auto md:max-w-lg mb-3">
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <p className="text-sm text-destructive">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="text-destructive/60 hover:text-destructive ml-3 flex-shrink-0 text-xs underline"
                  >
                    Dismiss
                  </button>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ============ TRANSCRIPT PANEL ============ */}
          <div className="flex-1 min-h-0 flex flex-col mx-4 md:mx-auto md:max-w-2xl w-full md:w-auto mb-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="h-px flex-1 bg-border/30" />
              <span className="text-xs text-muted-foreground font-medium tracking-wider uppercase">Live Transcript</span>
              <div className="h-px flex-1 bg-border/30" />
            </div>

            <Card className="flex-1 min-h-0 bg-card/40 border-border/20 shadow-sm overflow-hidden">
              <ScrollArea className="h-full max-h-[40vh] md:max-h-[45vh]">
                <div className="p-4 space-y-3">
                  {!hasTranscript && !isConnected && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                        <BsSoundwave className="h-6 w-6 text-primary/50" />
                      </div>
                      <p className="text-sm text-muted-foreground">Your conversation transcript will appear here</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Start a voice call to begin</p>
                    </div>
                  )}
                  {!hasTranscript && isConnected && (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <p className="text-sm text-muted-foreground">Connected -- start speaking to your concierge</p>
                    </div>
                  )}
                  {transcript.map((entry, idx) => (
                    <TranscriptBubble key={`${idx}-${entry.role}`} role={entry.role} text={entry.text} />
                  ))}
                  {currentThinking && isConnected && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border/30 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                          <span className="text-xs text-muted-foreground ml-1">{currentThinking}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* ============ SUGGESTION CHIPS (subtle, voice-only hints) ============ */}
          <div className="flex-shrink-0 pb-4 px-4 md:px-0">
            <div className="max-w-2xl mx-auto text-center">
              <p className="text-xs text-muted-foreground/60 mb-2">Try saying:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="outline"
                    className="text-xs font-normal text-muted-foreground/70 border-border/30 bg-transparent cursor-default"
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* ============ AGENT INFO FOOTER ============ */}
          <div className="flex-shrink-0 border-t border-border/20 bg-card/30 px-4 py-2.5">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full flex-shrink-0', isConnected ? 'bg-green-500' : 'bg-muted-foreground/40')} />
                <span className="text-xs text-muted-foreground">Booking Coordinator</span>
                <span className="text-xs text-muted-foreground/40">|</span>
                <span className="text-xs text-muted-foreground/60">Voice Agent</span>
              </div>
              <span className="text-[10px] text-muted-foreground/50">Routes to Room, Dining, Spa, and Activity specialists</span>
            </div>
          </div>

        </div>
      </div>
    </ErrorBoundary>
  )
}
