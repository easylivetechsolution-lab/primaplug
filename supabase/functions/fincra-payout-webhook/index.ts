import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === signatureHeader
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const rawBody = await req.text()
  console.log('=== PAYOUT WEBHOOK RECEIVED ===')
  console.log('RAW BODY:', rawBody)

  try {
    const signatureHeader = req.headers.get('signature') || ''
    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET') || ''
    const isValid = await verifySignature(rawBody, signatureHeader, webhookSecret)
    console.log('SIGNATURE VALID:', isValid)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let payload: any = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.log('Could not parse body as JSON')
    }

    const customerReference = payload?.data?.customerReference || `unknown_${Date.now()}`

    await supabase.from('fincra_webhook_events').insert({
      event_type: payload?.event || 'unknown',
      fincra_reference: customerReference,
      payload: payload,
      processed: false,
    })

    if (!isValid) {
      console.log('Signature invalid - event logged for inspection only')
      return new Response(JSON.stringify({ status: 'logged_invalid_signature' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const event = payload?.event
    const data = payload?.data

    // Find the matching pending withdrawal transaction
    const { data: txRow } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('fincra_reference', customerReference)
      .eq('status', 'pending')
      .maybeSingle()

    if (!txRow) {
      console.log('No matching pending withdrawal found for reference:', customerReference)
      return new Response(JSON.stringify({ status: 'no_matching_transaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (event === 'payout.successful') {
      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '✅ Withdrawal Successful',
        message: `Your withdrawal of ${txRow.currency} ${Number(txRow.amount).toLocaleString()} has been sent to your bank account.`,
        type: 'wallet',
      })

      console.log('=== PAYOUT CONFIRMED SUCCESSFUL ===')

    } else if (event === 'payout.failed') {
      // REFUND the user since the payout genuinely failed
      const balanceField = txRow.description?.includes('via credits') ? 'credit_balance' : 'wallet_balance'

      const { data: userRow } = await supabase
        .from('users')
        .select(balanceField)
        .eq('id', txRow.user_id)
        .single()

      const refundedBalance = Number(userRow?.[balanceField] || 0) + Number(txRow.amount)

      await supabase
        .from('users')
        .update({ [balanceField]: refundedBalance })
        .eq('id', txRow.user_id)

      await supabase
        .from('wallet_transactions')
        .update({ status: 'failed', description: txRow.description + ' - REFUNDED' })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '❌ Withdrawal Failed',
        message: `Your withdrawal of ${txRow.currency} ${Number(txRow.amount).toLocaleString()} failed and has been refunded to your balance.`,
        type: 'wallet',
      })

      console.log('=== PAYOUT FAILED - REFUNDED USER ===')
    }

    await supabase
      .from('fincra_webhook_events')
      .update({ processed: true })
      .eq('fincra_reference', customerReference)

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    console.log('CAUGHT ERROR:', e.message)
    return new Response(JSON.stringify({ status: 'error_logged', message: e.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})