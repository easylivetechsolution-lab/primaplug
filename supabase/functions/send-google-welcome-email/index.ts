import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => htmlEscapes[character] || character)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('WELCOME_EMAIL_FROM')

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !fromEmail) {
    console.error('Google welcome email is missing required configuration')
    return json({ error: 'Welcome email service is not configured' }, 503)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = authorization.slice('Bearer '.length)
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return json({ error: 'Invalid user session' }, 401)

  const providers: string[] = user.app_metadata?.providers || []
  if (user.app_metadata?.provider !== 'google' && !providers.includes('google')) {
    return json({ error: 'Google account required' }, 403)
  }
  if (!user.email) return json({ error: 'Google account has no email address' }, 400)
  const accountCreatedAt = Date.parse(user.created_at)
  if (!Number.isFinite(accountCreatedAt) || Date.now() - accountCreatedAt > 7 * 24 * 60 * 60 * 1000) {
    return json({ sent: false, skipped: true, reason: 'not_a_recent_signup' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: claimed, error: claimError } = await adminClient.rpc('claim_google_welcome_email', {
    p_user_id: user.id,
  })
  if (claimError) {
    console.error('Could not claim Google welcome email delivery:', claimError.message)
    return json({ error: 'Could not prepare welcome email' }, 500)
  }
  if (!claimed) return json({ sent: false, skipped: true, reason: 'already_sent_or_in_progress' })

  const firstName = (user.user_metadata?.full_name || user.user_metadata?.name || 'there')
    .trim()
    .split(/\s+/)[0]
  const safeFirstName = escapeHtml(firstName)

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: 'You’re in — welcome to PrimaPlug',
        html: `
          <div style="font-family:Arial,sans-serif;color:#211b45;max-width:560px;margin:0 auto;padding:32px 20px;line-height:1.6">
            <img src="https://primaplug.com/prima-logo.png" alt="PrimaPlug" width="48" height="48" style="display:block;border-radius:12px;margin-bottom:24px" />
            <h1 style="font-size:26px;margin:0 0 12px">You’re in, ${safeFirstName}!</h1>
            <p style="font-size:16px;color:#625e7a">You’ve successfully signed in to PrimaPlug with Google. Your account is ready. Here’s how to get started:</p>
            <ol style="padding-left:22px;color:#625e7a">
              <li style="margin-bottom:10px"><strong style="color:#211b45">Set up your profile.</strong> Add your real location, skills, experience, and the kind of work you’re looking for. A clear profile helps people know what to expect.</li>
              <li style="margin-bottom:10px"><strong style="color:#211b45">Explore Prima.</strong> Browse opportunities, apply for gigs, or post work and review applications. Use in-app chat to agree on the work, timing, and pay.</li>
              <li style="margin-bottom:10px"><strong style="color:#211b45">Keep work and payments clear.</strong> Follow the payment flow shown for each gig. For manual payments, both parties should confirm completion with accurate receipts.</li>
            </ol>
            <div style="background:#f5f2ff;border-radius:12px;padding:16px 18px;margin:22px 0">
              <strong style="color:#211b45">A few Prima standards</strong>
              <ul style="padding-left:20px;margin:8px 0 0;color:#625e7a">
                <li>Be honest in your profile, applications, listings, and receipts.</li>
                <li>Communicate respectfully, show up for accepted work, and honor agreed terms.</li>
                <li>Keep your password private and report suspicious or unsafe activity in the app.</li>
              </ul>
            </div>
            <p style="margin:28px 0"><a href="https://primaplug.com/onboarding" style="display:inline-block;background:#7047ff;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Finish setting up your profile</a></p>
            <p style="font-size:13px;color:#817d97">We’re glad you’re here. See you on Prima!<br />The PrimaPlug team</p>
          </div>
        `,
      }),
    })

    if (!emailResponse.ok) {
      const providerError = await emailResponse.text()
      console.error('Welcome email provider rejected the request:', emailResponse.status, providerError.slice(0, 500))
      await adminClient.rpc('finish_google_welcome_email', { p_user_id: user.id, p_sent: false })
      return json({ error: 'Welcome email delivery failed' }, 502)
    }

    const { error: finishError } = await adminClient.rpc('finish_google_welcome_email', {
      p_user_id: user.id,
      p_sent: true,
    })
    if (finishError) {
      console.error('Welcome email sent but delivery status could not be saved:', finishError.message)
    }

    return json({ sent: true })
  } catch (error) {
    console.error('Welcome email request failed:', error instanceof Error ? error.message : 'Unknown error')
    await adminClient.rpc('finish_google_welcome_email', { p_user_id: user.id, p_sent: false })
    return json({ error: 'Welcome email delivery failed' }, 502)
  }
})
