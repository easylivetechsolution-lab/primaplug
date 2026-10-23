import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyFincraSignature } from '../_shared/fincra-signature.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const rawBody = await req.text()
    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return json({ error: 'Invalid JSON payload' }, 400)
    }

    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET')
    if (!webhookSecret) return json({ error: 'Webhook signature verification is not configured' }, 500)
    if (!await verifyFincraSignature(payload, req.headers.get('signature'), webhookSecret)) {
      return json({ error: 'Invalid webhook signature' }, 401)
    }

    const event = payload?.event
    if (event !== 'payout.successful' && event !== 'payout.failed') {
      return json({ status: 'ignored' })
    }

    const data = payload?.data
    const reference = data?.customerReference || data?.reference || data?.merchantReference
    if (!reference) return json({ error: 'Missing payout reference' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { error: insertError } = await supabase.from('fincra_webhook_events').insert({
      event_type: event,
      fincra_reference: reference,
      payload,
      processed: false,
    })
    // A retry must reach the idempotent database settlement even when the
    // event log already contains this reference.
    if (insertError && insertError.code !== '23505') throw insertError

    const isCreditWithdrawal = String(reference).startsWith('credit_payout_')
    const { data: result, error: settleError } = isCreditWithdrawal
      ? await supabase.rpc('process_credit_fincra_payout', {
          p_reference: reference,
          p_success: event === 'payout.successful',
          p_conversion_success: typeof data?.isConversionSuccessful === 'boolean'
            ? data.isConversionSuccessful : null,
          p_fincra_payout_id: data?.id ? String(data.id) : null,
        })
      : await supabase.rpc('process_fincra_wallet_payout', {
          p_reference: reference,
          p_success: event === 'payout.successful',
        })
    if (settleError) throw settleError
    if (result?.status === 'not_found') return json({ status: 'no_matching_transaction' }, 404)

    await supabase.from('fincra_webhook_events')
      .update({ processed: true }).eq('fincra_reference', reference)

    return json({ status: 'ok', payout: result })
  } catch (error) {
    console.error('Fincra payout webhook error:', error)
    return json({ error: error.message || 'Webhook processing failed' }, 500)
  }
})
