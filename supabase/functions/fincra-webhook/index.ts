import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'

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
    const payload = await req.json()
    const eventType = payload?.event || payload?.type || payload?.event_type || 'unknown'
    const data = payload?.data || payload
    const reference = data?.reference || data?.paymentReference || data?.transactionReference
    const status = String(data?.status || '').toLowerCase()
    const amount = Number(data?.amount || data?.amountReceived || 0)
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

    if (logError?.code === '23505') return json({ ok: true, duplicate: true })
    if (logError) throw logError

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
        amount >= Number(commission.commission_amount) &&
        String(currency).toUpperCase() === String(commission.currency || 'NGN').toUpperCase()
      ) {
        await supabase.from('commissions').update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'fincra',
          flw_ref: reference,
        }).eq('id', commission.id)

        await supabase.rpc('check_commission_status', {
          p_worker_id: commission.worker_id,
        })
      }
    } else {
      const { data: tx } = await supabase
        .from('wallet_transactions')
        .select('id, user_id, amount, currency')
        .eq('fincra_reference', reference)
        .eq('status', 'pending')
        .maybeSingle()

      if (tx && amount >= Number(tx.amount)) {
        const { data: profile } = await supabase
          .from('users')
          .select('wallet_balance')
          .eq('id', tx.user_id)
          .single()

        const balanceAfter = Number(profile?.wallet_balance || 0) + Number(tx.amount)

        await supabase.from('users').update({
          wallet_balance: balanceAfter,
          wallet_currency: tx.currency,
        }).eq('id', tx.user_id)

        await supabase.from('wallet_transactions').update({
          status: 'completed',
          balance_after: balanceAfter,
        }).eq('id', tx.id)
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
