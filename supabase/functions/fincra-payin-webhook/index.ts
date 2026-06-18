import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
}

// HMAC SHA512 verification using Web Crypto (Deno-native, no external deps)
async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  )
  const computedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return computedSignature === signatureHeader
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // IMPORTANT: read raw body text FIRST, before any JSON.parse,
    // because the signature is computed over the exact raw payload
    const rawBody = await req.text()
    const signatureHeader = req.headers.get('signature') || ''
    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET')!

    const isValid = await verifySignature(rawBody, signatureHeader, webhookSecret)

    if (!isValid) {
      console.error('Webhook signature mismatch - discarding')
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload = JSON.parse(rawBody)
    const { event, data } = payload

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Log every webhook event for audit/debugging, dedupe by reference
    const fincraRef = data?.reference || data?.chargeReference
    const { data: existingEvent } = await supabase
      .from('fincra_webhook_events')
      .select('id')
      .eq('fincra_reference', fincraRef)
      .maybeSingle()

    if (existingEvent) {
      // Already processed this exact event - acknowledge but don't reprocess
      return new Response(
        JSON.stringify({ status: 'already_processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabase.from('fincra_webhook_events').insert({
      event_type: event,
      fincra_reference: fincraRef,
      payload: payload,
      processed: false,
    })

    if (event === 'charge.successful') {
      const merchantReference = data?.merchantReference
      const amountToSettle = data?.amountToSettle ?? data?.amount

      // Find our pending wallet_transactions row by the reference we generated
      const { data: txRow } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('fincra_reference', merchantReference || fincraRef)
        .eq('status', 'pending')
        .maybeSingle()

      if (!txRow) {
        console.error('No matching pending wallet transaction found for reference:', merchantReference)
        return new Response(
          JSON.stringify({ status: 'no_matching_transaction' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Credit the user's wallet
      const { data: userRow } = await supabase
        .from('users')
        .select('wallet_balance')
        .eq('id', txRow.user_id)
        .single()

      const newBalance = (userRow?.wallet_balance || 0) + Number(txRow.amount)

      await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', txRow.user_id)

      await supabase
        .from('wallet_transactions')
        .update({
          status: 'completed',
          balance_after: newBalance,
        })
        .eq('id', txRow.id)

      await supabase
        .from('fincra_webhook_events')
        .update({ processed: true })
        .eq('fincra_reference', fincraRef)

      // Notify the user
      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '💰 Wallet Funded',
        message: `Your wallet has been credited with ${txRow.currency} ${Number(txRow.amount).toLocaleString()}`,
        type: 'wallet',
      })
    }

    return new Response(
      JSON.stringify({ status: 'ok' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('Webhook handler error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})