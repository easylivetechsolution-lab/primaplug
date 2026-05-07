// Sound engine using Web Audio API — no files needed
const AudioContext = window.AudioContext || window.webkitAudioContext

let ctx = null

const getCtx = () => {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

const playTone = (frequency, duration, type = 'sine', volume = 0.3, delay = 0) => {
  try {
    const context = getCtx()
    const oscillator = context.createOscillator()
    const gainNode = context.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay)

    gainNode.gain.setValueAtTime(0, context.currentTime + delay)
    gainNode.gain.linearRampToValueAtTime(volume, context.currentTime + delay + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + delay + duration)

    oscillator.start(context.currentTime + delay)
    oscillator.stop(context.currentTime + delay + duration)
  } catch (e) {
    console.log('Sound error:', e)
  }
}

// Soft notification chime — like Facebook
export const playNotification = () => {
  playTone(587.33, 0.15, 'sine', 0.25, 0)      // D5
  playTone(880, 0.15, 'sine', 0.2, 0.12)         // A5
  playTone(1174.66, 0.3, 'sine', 0.15, 0.24)     // D6
}

// Success / accepted — uplifting
export const playAccepted = () => {
  playTone(523.25, 0.12, 'sine', 0.25, 0)        // C5
  playTone(659.25, 0.12, 'sine', 0.25, 0.1)      // E5
  playTone(783.99, 0.12, 'sine', 0.25, 0.2)      // G5
  playTone(1046.5, 0.3, 'sine', 0.2, 0.3)        // C6
}

// Declined — neutral subtle
export const playDeclined = () => {
  playTone(440, 0.15, 'sine', 0.2, 0)            // A4
  playTone(349.23, 0.3, 'sine', 0.15, 0.15)      // F4
}

// Receipt uploaded — soft alert
export const playReceipt = () => {
  playTone(698.46, 0.12, 'sine', 0.2, 0)         // F5
  playTone(880, 0.2, 'sine', 0.18, 0.12)         // A5
}

// Gig complete — celebration
export const playComplete = () => {
  playTone(523.25, 0.1, 'sine', 0.25, 0)         // C5
  playTone(659.25, 0.1, 'sine', 0.25, 0.08)      // E5
  playTone(783.99, 0.1, 'sine', 0.25, 0.16)      // G5
  playTone(1046.5, 0.1, 'sine', 0.25, 0.24)      // C6
  playTone(1318.51, 0.4, 'sine', 0.2, 0.32)      // E6
}

// New gig posted nearby — map ping
export const playMapPing = () => {
  playTone(1046.5, 0.08, 'sine', 0.15, 0)        // C6
  playTone(880, 0.15, 'sine', 0.1, 0.1)          // A5
}

// Message / application received
export const playMessage = () => {
  playTone(880, 0.1, 'sine', 0.2, 0)             // A5
  playTone(1108.73, 0.2, 'sine', 0.15, 0.1)      // C#6
}