import { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

export default function SelfieVerification({ onComplete, onSkip }) {
  const { user, profile } = useAuth()
  const [step, setStep] = useState('intro') // intro, camera, preview, uploading, done
  const [selfieImage, setSelfieImage] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const startCamera = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      })
      streamRef.current = stream

      setStep('camera')

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(e => console.log('Play error:', e))
        }
      }, 100)

    } catch (e) {
      console.log('Camera error:', e)
      if (e.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings and try again.')
      } else if (e.name === 'NotFoundError') {
        setError('No camera found on this device.')
      } else {
        setError('Could not access camera. Please try again.')
      }
    }
  }

  const takeSelfie = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    // Mirror the image for natural selfie feel
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.85)
    setSelfieImage(imageData)
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setStep('preview')
  }

  const retake = async () => {
    setSelfieImage(null)
    await startCamera()
  }

  const uploadSelfie = async () => {
    if (!selfieImage || !user) return
    setUploading(true)
    setError(null)

    try {
      // Convert base64 to blob
      const response = await fetch(selfieImage)
      const blob = await response.blob()
      const fileName = `selfie-${user.id}-${Date.now()}.jpg`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('selfies')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true
        })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('selfies')
        .getPublicUrl(fileName)

      // Update user profile
      const { error: updateError } = await supabase
        .from('users')
        .update({
          selfie_url: urlData.publicUrl,
          selfie_verified: true,
          selfie_verified_at: new Date().toISOString(),
          reverification_required: false
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      setStep('done')
      setTimeout(() => {
        onComplete && onComplete()
      }, 2000)

    } catch (e) {
      setError('Upload failed. Please try again.')
      console.log('Selfie upload error:', e)
    }
    setUploading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(20,18,58,0.92)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{
        background: '#fff', borderRadius: '24px',
        width: '100%', maxWidth: '420px',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)'
      }}>

        {/* INTRO STEP */}
        {step === 'intro' && (
          <div style={{ padding: '32px 28px', textAlign: 'center' }}>
            <div style={{
              width: '80px', height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '36px',
              margin: '0 auto 20px'
            }}>🤳</div>

            <div style={{
              fontSize: '22px', fontWeight: '800',
              color: '#14123A', marginBottom: '10px'
            }}>Selfie Verification</div>

            <div style={{
              fontSize: '13px', color: '#8B8FAF',
              lineHeight: '1.7', marginBottom: '24px'
            }}>
              Prima requires a one-time selfie to verify you are a real person.
              This keeps the community safe for everyone.
            </div>

            {/* What to expect */}
            <div style={{
              background: '#F5F4FF', borderRadius: '14px',
              padding: '16px', marginBottom: '24px',
              textAlign: 'left'
            }}>
              <div style={{
                fontSize: '11px', fontWeight: '700',
                color: '#6C47FF', textTransform: 'uppercase',
                letterSpacing: '1px', marginBottom: '12px'
              }}>What to expect</div>
              {[
                ['📸', 'Take a clear selfie of your face'],
                ['💡', 'Make sure lighting is good'],
                ['👁️', 'Look directly at the camera'],
                ['🔒', 'Your photo is stored securely'],
                ['👮', 'Only used for safety purposes'],
              ].map(([icon, text]) => (
                <div key={text} style={{
                  display: 'flex', gap: '10px',
                  alignItems: 'center', marginBottom: '8px'
                }}>
                  <span style={{ fontSize: '16px' }}>{icon}</span>
                  <span style={{
                    fontSize: '12px', color: '#5B5887'
                  }}>{text}</span>
                </div>
              ))}
            </div>

            {error && (
              <div style={{
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '12px', color: '#FF3366',
                marginBottom: '16px'
              }}>{error}</div>
            )}

            <button
              onClick={startCamera}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                border: 'none', borderRadius: '14px', padding: '16px',
                fontSize: '15px', fontWeight: '700', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
                marginBottom: '10px'
              }}>
              📸 Take Selfie Now
            </button>

            <button
              onClick={onSkip}
              style={{
                width: '100%', background: 'transparent',
                border: 'none', padding: '12px',
                fontSize: '13px', color: '#A09DC8',
                cursor: 'pointer', fontFamily: 'inherit'
              }}>
              Skip for now — limited access
            </button>
          </div>
        )}

        {/* CAMERA STEP */}
        {step === 'camera' && (
          <div>
            <div style={{
              padding: '20px 24px 0',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: '16px', fontWeight: '700', color: '#14123A'
              }}>Position your face</div>
              <button
                onClick={() => {
                  if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop())
                  }
                  setStep('intro')
                }}
                style={{
                  background: '#F5F4FF', border: 'none',
                  borderRadius: '50%', width: '32px', height: '32px',
                  fontSize: '16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center'
                }}>×</button>
            </div>

            {/* Camera Container */}
            <div style={{
              margin: '16px',
              borderRadius: '16px',
              overflow: 'hidden',
              position: 'relative',
              background: '#000',
              aspectRatio: '1'
            }}>
              {/* Video — full size, no transform issues */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                  display: 'block'
                }}
              />

              {/* Dark overlay with oval cutout using SVG */}
              <svg
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '100%', height: '100%',
                  pointerEvents: 'none'
                }}
                viewBox="0 0 400 400"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <mask id="oval-mask">
                    <rect width="400" height="400" fill="white" />
                    <ellipse cx="200" cy="200" rx="140" ry="170" fill="black" />
                  </mask>
                </defs>
                <rect
                  width="400" height="400"
                  fill="rgba(0,0,0,0.55)"
                  mask="url(#oval-mask)"
                />
                <ellipse
                  cx="200" cy="200" rx="140" ry="170"
                  fill="none"
                  stroke="#6C47FF"
                  strokeWidth="3"
                />
              </svg>

              {/* Instruction text */}
              <div style={{
                position: 'absolute',
                bottom: '16px', left: 0, right: 0,
                textAlign: 'center',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '600',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                zIndex: 10
              }}>
                Center your face in the oval
              </div>
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <div style={{ padding: '0 24px 28px' }}>
              <button
                onClick={takeSelfie}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: '700', color: '#fff',
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 20px rgba(108,71,255,0.4)',
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '10px'
                }}>
                <span style={{
                  width: '22px', height: '22px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.3)',
                  border: '3px solid #fff',
                  display: 'inline-block',
                  flexShrink: 0
                }} />
                Take Photo
              </button>
            </div>
          </div>
        )}

        {/* PREVIEW STEP */}
        {step === 'preview' && (
          <div>
            <div style={{
              padding: '20px 24px 0', textAlign: 'center'
            }}>
              <div style={{
                fontSize: '18px', fontWeight: '800',
                color: '#14123A', marginBottom: '4px'
              }}>Looking good!</div>
              <div style={{
                fontSize: '13px', color: '#8B8FAF'
              }}>Is this photo clear and well-lit?</div>
            </div>

            <div style={{ margin: '16px', position: 'relative' }}>
              <img
                src={selfieImage}
                alt="Your selfie"
                style={{
                  width: '100%', borderRadius: '16px',
                  aspectRatio: '1', objectFit: 'cover'
                }}
              />
              {/* Checkmark overlay */}
              <div style={{
                position: 'absolute', bottom: '12px', right: '12px',
                width: '40px', height: '40px', borderRadius: '50%',
                background: '#00C48C', border: '3px solid #fff',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '18px'
              }}>✓</div>
            </div>

            {error && (
              <div style={{
                margin: '0 24px',
                background: '#FFE8EE', border: '1.5px solid #FF99B3',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '12px', color: '#FF3366',
                marginBottom: '12px'
              }}>{error}</div>
            )}

            <div style={{
              padding: '0 24px 28px',
              display: 'flex', gap: '10px'
            }}>
              <button
                onClick={retake}
                style={{
                  flex: 1, background: '#F5F4FF',
                  border: '1.5px solid #E2E0FF',
                  borderRadius: '12px', padding: '14px',
                  fontSize: '13px', fontWeight: '700',
                  color: '#8B8FAF', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}>🔄 Retake</button>
              <button
                onClick={uploadSelfie}
                disabled={uploading}
                style={{
                  flex: 2,
                  background: uploading
                    ? '#B8A5FF'
                    : 'linear-gradient(135deg, #6C47FF, #9B59FF)',
                  border: 'none', borderRadius: '12px', padding: '14px',
                  fontSize: '13px', fontWeight: '700', color: '#fff',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: uploading
                    ? 'none' : '0 4px 20px rgba(108,71,255,0.4)'
                }}>
                {uploading ? '⏳ Uploading...' : '✓ Use This Photo'}
              </button>
            </div>
          </div>
        )}

        {/* DONE STEP */}
        {step === 'done' && (
          <div style={{
            padding: '48px 28px', textAlign: 'center'
          }}>
            <div style={{
              width: '80px', height: '80px',
              borderRadius: '50%', background: '#DFFDF4',
              border: '3px solid #7EECD2',
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '36px',
              margin: '0 auto 20px'
            }}>✓</div>
            <div style={{
              fontSize: '22px', fontWeight: '800',
              color: '#14123A', marginBottom: '8px'
            }}>Verified!</div>
            <div style={{
              fontSize: '13px', color: '#8B8FAF', lineHeight: '1.6'
            }}>
              Your selfie has been saved securely.
              You now have full access to Prima.
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}