import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reference } = await req.json()

    if (!reference) {
      return new Response(
        JSON.stringify({ error: 'Missing reference' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find our pending transaction first
    const { data: txRow, error: txError } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('fincra_reference', reference)
      .maybeSingle()

    if (txError) throw txError

    if (!txRow) {
      return new Response(
        JSON.stringify({ error: 'No transaction found for this reference' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (txRow.status === 'completed') {
      return new Response(
        JSON.stringify({ status: 'already_completed', transaction: txRow }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call Fincra's verify endpoint using OUR reference (merchant-reference)
    const verifyRes = await fetch(
      `https://sandboxapi.fincra.com/checkout/payments/merchant-reference/${reference}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': Deno.env.get('FINCRA_SECRET_KEY')!,
          'x-business-id': Deno.env.get('FINCRA_BUSINESS_ID')!,
        },
      }
    )

    const verifyData = await verifyRes.json()
    console.log('Fincra verify response:', JSON.stringify(verifyData))

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({ status: 'verify_failed', details: verifyData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const txStatus = verifyData?.data?.status

    if (txStatus !== 'success' && txStatus !== 'successful') {
      return new Response(
        JSON.stringify({ status: 'not_yet_successful', fincraStatus: txStatus, details: verifyData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Payment confirmed successful - credit the wallet now
    const { data: userRow } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', txRow.user_id)
      .single()

const isCommissionPayment = !!txRow.related_commission_id

if (isCommissionPayment) {
  // Mark the EXACT commission row paid — no ambiguity from
  // amount-matching, uses the direct foreign key link instead
  const { error: commissionUpdateError, data: updatedCommission } = await supabase
    .from('commissions')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'fincra'
    })
    .eq('id', txRow.related_commission_id)
    .eq('status', 'pending')
    .select()

  console.log('Commission update result:', JSON.stringify(updatedCommission), 'error:', JSON.stringify(commissionUpdateError))

      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', txRow.id)

      await supabase.rpc('check_commission_status', { p_worker_id: txRow.user_id })

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '✅ Commission Paid!',
        message: `Your platform commission of ${txRow.currency} ${Number(txRow.amount).toLocaleString()} has been paid.`,
        type: 'general',
      })
    } else {
      const newBalance = Number(userRow?.wallet_balance || 0) + Number(txRow.amount)

      await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', txRow.user_id)

      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed', balance_after: newBalance })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '💰 Wallet Funded',
        message: `Your wallet has been credited with ${txRow.currency} ${Number(txRow.amount).toLocaleString()}`,
        type: 'wallet',
      })
    }

    return new Response(
      JSON.stringify({ status: 'completed', newBalance }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('Verify function error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})