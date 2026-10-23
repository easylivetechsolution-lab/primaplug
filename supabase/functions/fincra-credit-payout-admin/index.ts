import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Authentication required' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) return json({ error: 'Server configuration error' }, 500)

    const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid user session' }, 401)

    const serviceClient = createClient(url, serviceRoleKey)
    const { data: profile, error: profileError } = await serviceClient
      .from('users').select('is_admin').eq('id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (profile?.is_admin !== true) return json({ error: 'Administrator access required' }, 403)

    const body = await req.json()
    if (body?.action === 'list') {
      const { data, error } = await serviceClient
        .from('credit_withdrawals')
        .select('id, user_id, credits_amount, usd_amount, destination_currency, destination_country, destination_amount, fincra_reference, fincra_payout_id, created_at')
        .eq('status', 'recovery_required')
        .order('created_at', { ascending: true })
        .limit(100)
      if (error) throw error
      return json({ withdrawals: data || [] })
    }

    if (body?.action !== 'resolve') return json({ error: 'Invalid action' }, 400)
    const reference = String(body.reference || '').trim()
    const resolution = String(body.resolution || '')
    const notes = String(body.notes || '').trim()
    const fundsReturned = body.fundsReturned === true
    const payoutId = body.fincraPayoutId ? String(body.fincraPayoutId).trim() : null
    if (!reference || notes.length < 5 || notes.length > 2000
      || !['payout_completed', 'funds_returned_credit_refunded'].includes(resolution)) {
      return json({ error: 'Reference, valid resolution, and reconciliation notes are required' }, 400)
    }
    if (resolution === 'funds_returned_credit_refunded' && !fundsReturned) {
      return json({ error: 'Confirm the converted funds have returned to Prima before refunding credits' }, 400)
    }

    const { data, error } = await serviceClient.rpc('resolve_credit_withdrawal_recovery', {
      p_reference: reference,
      p_resolution: resolution,
      p_admin_user_id: user.id,
      p_notes: notes,
      p_fincra_payout_id: payoutId,
      p_funds_returned: fundsReturned,
    })
    if (error) throw error
    return json({ result: data })
  } catch (error) {
    console.error('Credit payout recovery admin error:', error)
    return json({ error: error.message || 'Could not process payout recovery' }, 500)
  }
})
