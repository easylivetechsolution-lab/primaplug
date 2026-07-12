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
    const verifyHeaders: Record<string, string> = {
      'accept': 'application/json',
      'api-key': Deno.env.get('FINCRA_SECRET_KEY')!,
    }
    const businessId = Deno.env.get('FINCRA_BUSINESS_ID')
    if (businessId) verifyHeaders['x-business-id'] = businessId

    const verifyRes = await fetch(
      `https://sandboxapi.fincra.com/checkout/payments/merchant-reference/${reference}`,
      { method: 'GET', headers: verifyHeaders }
    )

    const verifyData = await verifyRes.json()
    console.log('Fincra verify response:', JSON.stringify(verifyData))

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({ status: 'verify_failed', details: verifyData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const txStatus = String(verifyData?.data?.status || '').toLowerCase()
    const isSuccessful = ['success', 'successful', 'completed', 'paid'].includes(txStatus)

    if (!isSuccessful) {
      return new Response(
        JSON.stringify({ status: 'not_yet_successful', fincraStatus: txStatus, details: verifyData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Payment confirmed successful
    const isCommissionPayment = !!txRow.related_commission_id
    const isBoostPayment       = txRow.type === 'boost'
    let newBalance: number | undefined

    if (isBoostPayment) {
      // Extract boost metadata stored in the transaction
      const serviceId = txRow.service_id
      const days      = Number(txRow.description?.match(/(\d+) days/)?.[1] || 7)

      if (!serviceId) throw new Error('Boost transaction missing service_id')

      // Service role bypasses RLS — update featured_until directly
      const newUntil = new Date()
      newUntil.setDate(newUntil.getDate() + days)

      const { data: currentSvc } = await supabase
        .from('services')
        .select('featured_until')
        .eq('id', serviceId)
        .maybeSingle()

      const existingUntil = currentSvc?.featured_until ? new Date(currentSvc.featured_until) : null
      const finalUntil    = existingUntil && existingUntil > new Date()
        ? new Date(existingUntil.getTime() + days * 86400000)
        : newUntil

      await supabase
        .from('services')
        .update({ is_featured: true, featured_until: finalUntil.toISOString() })
        .eq('id', serviceId)

      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title:   '⚡ Service Boosted!',
        message: `Your service is now featured for ${days} days.`,
        type:    'general',
      })

    } else if (isCommissionPayment) {
      // Mark the EXACT commission row paid
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
      const currency = txRow.currency || 'NGN'
      const creditAmount = Number(txRow.amount)

      // Atomically credit the multi-currency wallet (creates row if first deposit)
      const { data: walletBal, error: creditErr } = await supabase.rpc('_credit_wallet', {
        p_user_id:  txRow.user_id,
        p_currency: currency,
        p_amount:   creditAmount,
      })
      if (creditErr) throw creditErr

      newBalance = walletBal as number

      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed', balance_after: newBalance })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '💰 Wallet Funded',
        message: `Your ${currency} wallet has been credited with ${currency} ${creditAmount.toLocaleString()}`,
        type: 'wallet',
      })
    }

    return new Response(
      JSON.stringify({ status: 'completed', ...(newBalance !== undefined ? { newBalance } : {}) }),
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
