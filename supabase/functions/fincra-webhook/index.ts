import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'
import { verifyFincraSignature } from '../_shared/fincra-signature.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let payload: any
    try {
      payload = JSON.parse(await req.text())
    } catch {
      return json({ error: 'Invalid JSON payload' }, 400)
    }

    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET')
    if (!webhookSecret) return json({ error: 'Webhook signature verification is not configured' }, 500)
    if (!await verifyFincraSignature(payload, req.headers.get('signature'), webhookSecret)) {
      return json({ error: 'Invalid webhook signature' }, 401)
    }

    const eventType = payload?.event || payload?.type || payload?.event_type || 'unknown'
    const data = payload?.data || payload
    const reference = data?.merchantReference || data?.MerchantReference || data?.reference || data?.paymentReference || data?.transactionReference || data?.chargeReference
    const status = String(data?.status || '').toLowerCase()
    const settledAmount = Number(
      data?.amountToSettle ??
      data?.metadata?.amount ??
      data?.amountExpected ??
      (String(data?.feeBearer || '').toLowerCase() === 'business'
        ? data?.amountReceived ?? data?.amount
        : NaN)
    )
    const varianceType = String(data?.varianceType || '').toLowerCase()
    const currency = data?.currency || 'NGN'
    const metadata = data?.metadata || {}

    if (!reference) return json({ error: 'Missing Fincra reference' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: logError } = await supabase.from('fincra_webhook_events').insert({
      event_type: eventType,
      fincra_reference: reference,
      payload,
      processed: false,
    })

    if (logError?.code === '23505' && eventType !== 'charge.successful') return json({ ok: true, duplicate: true })
    if (logError && logError.code !== '23505') throw logError

    const isSuccessful = ['successful', 'success', 'completed', 'paid'].includes(status)
    if (!isSuccessful) return json({ ok: true, processed: false })

    if (metadata.type === 'commission' && metadata.commission_id) {
      const { data: commission } = await supabase
        .from('commissions')
        .select('id, worker_id, commission_amount, currency')
        .eq('id', metadata.commission_id)
        .maybeSingle()

      if (
        commission &&
        Number.isFinite(settledAmount) &&
        Math.round(settledAmount * 100) === Math.round(Number(commission.commission_amount) * 100) &&
        varianceType !== 'underpayment' &&
        String(currency).toUpperCase() === String(commission.currency || 'NGN').toUpperCase()
      ) {
        await supabase.from('commissions').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'fincra',
        }).eq('id', commission.id)

        await supabase.rpc('check_commission_status', {
          p_worker_id: commission.worker_id,
        })
      }
    } else {
      const { data: tx, error: txError } = await supabase
        .from('wallet_transactions')
        .select('id, user_id, amount, currency, type, status')
        .eq('fincra_reference', reference)
        .maybeSingle()
      if (txError) throw txError

      if (tx?.status === 'completed') {
        // A duplicate successful event is already settled.
      } else if (
        tx &&
        Number.isFinite(settledAmount) &&
        Math.round(settledAmount * 100) === Math.round(Number(tx.amount) * 100) &&
        varianceType !== 'underpayment' &&
        String(currency).toUpperCase() === String(tx.currency || 'NGN').toUpperCase()
      ) {
        if (tx.type === 'fund_in') {
          const { error: completionError } = await supabase.rpc(
            'complete_fincra_wallet_funding',
            { p_reference: reference }
          )
          if (completionError) throw completionError
        }
      } else {
        return json({ ok: false, processed: false, reason: 'amount_or_currency_mismatch' }, 409)
      }
    }

    await supabase.from('fincra_webhook_events').update({
      processed: true,
    }).eq('fincra_reference', reference)

    return json({ ok: true, processed: true })
  } catch (error) {
    console.error('fincra-webhook error:', error)
    return json({ error: error.message }, 500)
  }
})
