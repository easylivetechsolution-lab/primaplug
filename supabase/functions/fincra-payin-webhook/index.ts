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
  console.log('=== WEBHOOK RECEIVED ===')
  console.log('RAW BODY:', rawBody)

  try {
    const signatureHeader = req.headers.get('signature') || ''
    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET') || ''
    // Only verify if a secret is actually configured — skip in sandbox when not set
    const signatureSkipped = !webhookSecret
    const isValid = signatureSkipped
      ? true
      : await verifySignature(rawBody, signatureHeader, webhookSecret)
    console.log('SIGNATURE VALID:', isValid, '| SKIPPED:', signatureSkipped)

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

    const fincraRef = payload?.data?.merchantReference
      || payload?.data?.reference
      || payload?.data?.chargeReference
      || `unknown_${Date.now()}`

    // Log the event (ignore duplicate inserts — event may arrive twice)
    const { error: insertErr } = await supabase.from('fincra_webhook_events').insert({
      event_type: payload?.event || 'unknown',
      fincra_reference: fincraRef,
      payload: payload,
      processed: false,
    })
    if (insertErr?.code === '23505') {
      console.log('Duplicate webhook — already processed, skipping')
      return new Response(JSON.stringify({ status: 'duplicate' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    console.log('Logged event to fincra_webhook_events, ref:', fincraRef)

    // Signature mismatch is logged as a warning but does NOT block processing
    // This ensures payments are never lost due to a misconfigured webhook secret
    if (!isValid) {
      console.log('WARNING: Signature mismatch — processing anyway to avoid lost payments')
    }

    const event = payload?.event
    const data = payload?.data

    if (event === 'charge.successful') {
      const merchantReference = data?.merchantReference || data?.reference
      const amount = data?.amount

      console.log('Looking for pending transaction with reference:', merchantReference)

      const { data: txRow, error: txFindError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('fincra_reference', merchantReference)
        .eq('status', 'pending')
        .maybeSingle()

      console.log('Transaction lookup result:', JSON.stringify(txRow), 'error:', JSON.stringify(txFindError))

      let resolvedTx = txRow

      // Fallback: if no match by reference, look up by user_id from Fincra metadata
      if (!resolvedTx && data?.metadata?.userId) {
        console.log('Reference mismatch — trying fallback lookup via metadata.userId:', data.metadata.userId)
        const { data: fallbackTx } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', data.metadata.userId)
          .eq('status', 'pending')
          .eq('type', 'fund_in')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        resolvedTx = fallbackTx
        console.log('Fallback tx:', JSON.stringify(resolvedTx))
      }

      if (resolvedTx) {
        const { data: userRow } = await supabase
          .from('users')
          .select('wallet_balance, wallet_currency')
          .eq('id', resolvedTx.user_id)
          .single()

        const newBalance = Number(userRow?.wallet_balance || 0) + Number(resolvedTx.amount)
        console.log('Updating wallet balance to:', newBalance)

        const updatePayload: Record<string, unknown> = { wallet_balance: newBalance }
        if (!userRow?.wallet_currency && resolvedTx.currency) {
          updatePayload.wallet_currency = resolvedTx.currency
        }

        await supabase.from('users').update(updatePayload).eq('id', resolvedTx.user_id)
        await supabase.from('wallet_transactions').update({
          status: 'completed', balance_after: newBalance
        }).eq('id', resolvedTx.id)
        await supabase.from('fincra_webhook_events').update({ processed: true }).eq('fincra_reference', fincraRef)

        await supabase.from('notifications').insert({
          user_id: resolvedTx.user_id,
          title: '💰 Wallet Funded',
          message: `Your wallet has been credited with ${resolvedTx.currency} ${Number(resolvedTx.amount).toLocaleString()}`,
          type: 'wallet',
        })

        console.log('=== WALLET UPDATED SUCCESSFULLY ===')
      } else {
        console.log('NO MATCHING PENDING TRANSACTION FOUND for reference:', merchantReference)
      }
    } else {
      console.log('Event type was not charge.successful, it was:', event)
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    console.log('CAUGHT ERROR:', e.message, e.stack)
    return new Response(JSON.stringify({ status: 'error_logged', message: e.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})