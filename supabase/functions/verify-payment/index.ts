import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { tx_ref, expected_amount, expected_currency } = await req.json()

    if (!tx_ref) {
      return new Response(
        JSON.stringify({ error: 'tx_ref required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')
    if (!secretKey) {
      return new Response(
        JSON.stringify({ verified: false, message: 'Payment verification is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify with Flutterwave
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          'Authorization': `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    const data = await response.json()
    console.log('Flutterwave verification:', data)

    if (data.status !== 'success') {
      return new Response(
        JSON.stringify({ verified: false, message: 'Payment not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const transaction = data.data
    const parts = tx_ref.split('-')
    const paymentType = parts[1] // COMM or WITH
    const paymentId = parts[2]
    const expectedAmount = Number(expected_amount)
    const expectedCurrency = String(expected_currency || '').toUpperCase()

    const isSuccessful =
      transaction.status === 'successful' &&
      transaction.tx_ref === tx_ref &&
      transaction.amount > 0 &&
      (!expectedAmount || Number(transaction.amount) >= expectedAmount) &&
      (!expectedCurrency || String(transaction.currency).toUpperCase() === expectedCurrency)

    if (!isSuccessful) {
      return new Response(
        JSON.stringify({ verified: false, message: 'Payment details did not match' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (paymentType === 'COMM') {
      const commissionId = paymentId

      const { data: commission, error: commissionError } = await supabase
        .from('commissions')
        .select('id, worker_id, commission_amount, currency, status')
        .eq('id', commissionId)
        .single()

      if (
        commissionError ||
        !commission ||
        Number(transaction.amount) < Number(commission.commission_amount) ||
        String(transaction.currency).toUpperCase() !== String(commission.currency || 'NGN').toUpperCase()
      ) {
        return new Response(
          JSON.stringify({ verified: false, message: 'Payment does not match commission record' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Update commission as paid
      await supabase
        .from('commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'flutterwave',
          flw_ref: transaction.flw_ref
        })
        .eq('id', commissionId)

      if (commission) {
        // Update account status
        await supabase.rpc('check_commission_status', {
          p_worker_id: commission.worker_id
        })

        // Notify worker
        await supabase.from('notifications').insert({
          user_id: commission.worker_id,
          title: '✅ Commission Paid!',
          message: 'Your platform commission has been paid. Account fully restored.',
          type: 'general'
        })
      }
    }

    return new Response(
      JSON.stringify({
        verified: true,
        amount: transaction.amount,
        currency: transaction.currency,
        flw_ref: transaction.flw_ref,
        tx_ref: transaction.tx_ref,
        payment_type: transaction.payment_type,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Verification error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
