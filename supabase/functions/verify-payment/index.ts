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
    const { tx_ref } = await req.json()

    if (!tx_ref) {
      return new Response(
        JSON.stringify({ error: 'tx_ref required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const secretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY')

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
    const isSuccessful =
      transaction.status === 'successful' &&
      transaction.amount > 0

    if (!isSuccessful) {
      return new Response(
        JSON.stringify({ verified: false, message: 'Payment not successful' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse tx_ref to determine payment type
    // Format: PRIMA-COMM-{commissionId}-{timestamp}
    // Format: PRIMA-WITH-{withdrawalId}-{timestamp}
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const parts = tx_ref.split('-')
    const paymentType = parts[1] // COMM or WITH

    if (paymentType === 'COMM') {
      const commissionId = parts[2]

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

      // Get worker id
      const { data: commission } = await supabase
        .from('commissions')
        .select('worker_id')
        .eq('id', commissionId)
        .single()

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