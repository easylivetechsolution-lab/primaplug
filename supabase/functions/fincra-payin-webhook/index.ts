import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyFincraSignature } from '../_shared/fincra-signature.ts'

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

  try {
    const rawBody = await req.text()
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET')
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook signature verification is not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (!await verifyFincraSignature(payload, req.headers.get('signature'), webhookSecret)) {
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const fincraRef = payload?.data?.merchantReference
      || payload?.data?.MerchantReference
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
    if (insertErr?.code === '23505' && payload?.event !== 'charge.successful') {
      console.log('Duplicate webhook — already processed, skipping')
      return new Response(JSON.stringify({ status: 'duplicate' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    console.log('Logged event to fincra_webhook_events, ref:', fincraRef)

    const event = payload?.event
    const data = payload?.data

    if (event === 'charge.successful') {
      const merchantReference = data?.merchantReference || data?.MerchantReference || data?.reference || data?.chargeReference
      if (!merchantReference) throw new Error('Successful charge webhook is missing its merchant reference')

      const settledAmount = Number(
        data?.amountToSettle ??
        data?.metadata?.amount ??
        data?.amountExpected ??
        (String(data?.feeBearer || '').toLowerCase() === 'business'
          ? data?.amountReceived ?? data?.amount
          : NaN)
      )
      const varianceType = String(data?.varianceType || '').toLowerCase()
      const currency = String(data?.currency || '').toUpperCase()
      const { data: tx, error: txError } = await supabase
        .from('wallet_transactions')
        .select('amount, currency, status')
        .eq('fincra_reference', merchantReference)
        .maybeSingle()
      if (txError) throw txError
      if (!tx) throw new Error('No wallet transaction exists for this Fincra reference')
      if (tx.status === 'completed') {
        await supabase.from('fincra_webhook_events')
          .update({ processed: true }).eq('fincra_reference', fincraRef)
        return new Response(JSON.stringify({ status: 'duplicate' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (
        !Number.isFinite(settledAmount) ||
        Math.round(settledAmount * 100) !== Math.round(Number(tx.amount) * 100) ||
        varianceType === 'underpayment' ||
        currency !== String(tx.currency || 'NGN').toUpperCase()
      ) {
        return new Response(JSON.stringify({
          status: 'amount_or_currency_mismatch',
          processed: false,
        }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: completion, error: completionError } = await supabase.rpc(
        'complete_fincra_wallet_funding',
        { p_reference: merchantReference }
      )
      if (completionError) throw completionError
      await supabase.from('fincra_webhook_events')
        .update({ processed: true }).eq('fincra_reference', fincraRef)
      console.log('Funding webhook reconciled:', JSON.stringify(completion))
    } else {
      console.log('Event type was not charge.successful, it was:', event)
    }

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    console.log('CAUGHT ERROR:', e.message, e.stack)
    return new Response(JSON.stringify({ status: 'error_logged', message: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
