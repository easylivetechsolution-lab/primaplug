import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'

const SELFIE_QUALITY = {
  minBrightness: 70,
  maxBrightness: 220,
  minContrast: 28,
  minSharpness: 16,
  minSkinRatio: 0.07,
  minFaceWidthRatio: 0.22,
  minFaceHeightRatio: 0.28,
  maxFaceWidthRatio: 0.88,
  maxFaceHeightRatio: 0.95,
}

export default function SelfieVerification({ onComplete, onSkip }) {
  const { user } = useAuth()
  const [step, setStep] = useState('intro') // intro, camera, preview, uploading, done
  const [selfieImage, setSelfieImage] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const getImageQuality = (imageData) => {
    const { data, width, height } = imageData
    let luminanceSum = 0
    let luminanceSqSum = 0
    let sampled = 0
    let skinPixels = 0

    const centerX = width / 2
    const centerY = height / 2
    const ovalRx = width * 0.35
    const ovalRy = height * 0.43
    const step = Math.max(1, Math.floor(Math.min(width, height) / 180))

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const dx = (x - centerX) / ovalRx
        const dy = (y - centerY) / ovalRy
        if ((dx * dx) + (dy * dy) > 1) continue

        const index = (y * width + x) * 4
        const r = data[index]
        const g = data[index + 1]
        const b = data[index + 2]
        const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)

        luminanceSum += luminance
        luminanceSqSum += luminance * luminance
        sampled += 1

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const looksLikeSkin = r > 55 && g > 35 && b > 20 && max - min > 15 && r > g && r > b && Math.abs(r - g) > 8
        if (looksLikeSkin) skinPixels += 1
      }
    }

    const brightness = sampled ? luminanceSum / sampled : 0
    const variance = sampled ? (luminanceSqSum / sampled) - (brightness * brightness) : 0
    const contrast = Math.sqrt(Math.max(variance, 0))
    const skinRatio = sampled ? skinPixels / sampled : 0

    return {
      brightness,
      contrast,
      skinRatio,
      sharpness: getSharpness(imageData),
    }
  }

  const getSharpness = (imageData) => {
    const { data, width, height } = imageData
    const step = Math.max(2, Math.floor(Math.min(width, height) / 120))
    let sum = 0
    let sumSq = 0
    let count = 0

    for (let y = step; y < height - step; y += step) {
      for (let x = step; x < width - step; x += step) {
        const center = getLuminanceAt(data, width, x, y)
        const laplacian =
          (getLuminanceAt(data, width, x - step, y) +
            getLuminanceAt(data, width, x + step, y) +
            getLuminanceAt(data, width, x, y - step) +
            getLuminanceAt(data, width, x, y + step)) -
          (4 * center)

        sum += laplacian
        sumSq += laplacian * laplacian
        count += 1
      }
    }

    if (!count) return 0
    const mean = sum / count
    return (sumSq / count) - (mean * mean)
  }

  const getLuminanceAt = (data, width, x, y) => {
    const index = (y * width + x) * 4
    return (0.2126 * data[index]) + (0.7152 * data[index + 1]) + (0.0722 * data[index + 2])
  }

  const validateDetectedFace = (face, canvas) => {
    const box = face.boundingBox
    if (!box) return 'Face could not be measured. Try again with your face clearly visible.'

    const faceCenterX = box.x + (box.width / 2)
    const faceCenterY = box.y + (box.height / 2)
    const frameCenterX = canvas.width / 2
    const frameCenterY = canvas.height / 2
    const centeredEnough =
      Math.abs(faceCenterX - frameCenterX) < canvas.width * 0.18 &&
      Math.abs(faceCenterY - frameCenterY) < canvas.height * 0.2

    if (!centeredEnough) return 'Center your face inside the oval and try again.'

    const widthRatio = box.width / canvas.width
    const heightRatio = box.height / canvas.height
    if (widthRatio < SELFIE_QUALITY.minFaceWidthRatio || heightRatio < SELFIE_QUALITY.minFaceHeightRatio) {
      return 'Move closer so your face fills more of the oval.'
    }

    if (widthRatio > SELFIE_QUALITY.maxFaceWidthRatio || heightRatio > SELFIE_QUALITY.maxFaceHeightRatio) {
      return 'Move back a little so your full face fits inside the oval.'
    }

    return null
  }

  const validateSelfie = async (canvas) => {
    const ctx = canvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const quality = getImageQuality(imageData)

    if (quality.brightness < SELFIE_QUALITY.minBrightness) {
      return 'The photo is too dark. Move to better lighting and keep your face visible.'
    }

    if (quality.brightness > SELFIE_QUALITY.maxBrightness) {
      return 'The photo is too bright. Reduce glare or move away from direct light.'
    }

    if (quality.contrast < SELFIE_QUALITY.minContrast) {
      return 'The photo is too flat or unclear. Use better lighting and face the camera.'
    }

    if (quality.sharpness < SELFIE_QUALITY.minSharpness) {
      return 'The photo looks blurry. Hold still and retake it.'
    }

    if ('FaceDetector' in window) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 })
        const faces = await detector.detect(canvas)

        if (faces.length === 0) return 'No face detected. Please take a real selfie with your face in the oval.'
        if (faces.length > 1) return 'Only one face should be visible. Please retake the selfie alone.'

        const faceProblem = validateDetectedFace(faces[0], canvas)
        if (faceProblem) return faceProblem
      } catch (e) {
        console.log('Face detection unavailable:', e)
      }
    } else if (quality.skinRatio < SELFIE_QUALITY.minSkinRatio) {
      return 'No clear face detected. Make sure your face is visible, uncovered, and well-lit.'
    }

    return null
  }

  useEffect(() => {
    window.history.pushState({ modal: 'open' }, '', '')
    const handleBack = () => onSkip()
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [onSkip])

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
        setError('Camera access denied. Please allow camera access in your browser settings and try again.')
      } else if (e.name === 'NotFoundError') {
        setError('No camera found on this device.')
      } else {
        setError('Could not access camera: ' + e.message)
      }
    }
  }

  const takeSelfie = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video.videoWidth || !video.videoHeight) {
      setError('Camera is still starting. Please wait a moment and try again.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')

    setError(null)

    // Mirror the image for natural selfie feel
    ctx.save()
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.restore()

    const validationError = await validateSelfie(canvas)
    if (validationError) {
      setError(validationError)
      return
    }

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
              {error && (
                <div style={{
                  background: '#FFE8EE', border: '1.5px solid #FF99B3',
                  borderRadius: '10px', padding: '10px 14px',
                  fontSize: '12px', color: '#FF3366',
                  marginBottom: '12px'
                }}>{error}</div>
              )}

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
