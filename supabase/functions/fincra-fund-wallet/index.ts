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
    const { userId: requestedUserId, amount, currency, email, name, relatedCommissionId } = await req.json()
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user || user.id !== requestedUserId) {
      return new Response(JSON.stringify({ error: 'Invalid user session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = user.id
    console.log('Received funding request:', JSON.stringify({ userId, amount, currency, relatedCommissionId }))

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid userId/amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let commissionId: string | null = null
    if (relatedCommissionId) {
      const { data: commission, error: commissionError } = await supabase
        .from('commissions')
        .select('id, worker_id, commission_amount, currency, status')
        .eq('id', relatedCommissionId)
        .eq('worker_id', userId)
        .maybeSingle()
      if (commissionError) throw commissionError
      if (!commission || commission.status !== 'pending') {
        return new Response(JSON.stringify({ error: 'Commission is not payable.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const commissionCurrency = String(commission.currency || 'NGN').toUpperCase()
      if (
        Number(commission.commission_amount) !== Number(amount) ||
        commissionCurrency !== String(currency || 'NGN').toUpperCase()
      ) {
        return new Response(JSON.stringify({ error: 'Commission amount or currency changed. Refresh and try again.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      commissionId = commission.id
    }

    const reference = `wallet_${userId}_${crypto.randomUUID()}`

    // Persist the merchant reference first. If Fincra creates a checkout but
    // the response is interrupted, a later webhook can still reconcile it.
    if (commissionId) {
      const { data: reservation, error: reserveError } = await supabase.rpc(
        'reserve_fincra_commission_payment',
        {
          p_commission_id: commissionId,
          p_user_id: userId,
          p_amount: Number(amount),
          p_currency: currency || 'NGN',
          p_reference: reference,
        },
      )
      if (reserveError) throw reserveError
      if (reservation?.status === 'already_pending') {
        return new Response(JSON.stringify({
          error: 'A payment for this commission is already pending. Check the existing checkout before trying again.',
          reference: reservation.reference,
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (reservation?.status !== 'reserved') {
        return new Response(JSON.stringify({ error: 'Commission is no longer payable. Refresh and try again.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      const { error: transactionError } = await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'fund_in',
        amount: amount,
        currency: currency || 'NGN',
        fincra_reference: reference,
        status: 'pending',
        description: 'Wallet funding initiated',
      })
      if (transactionError) throw transactionError
    }

const PAYMENT_METHODS_BY_CURRENCY: Record<string, string[]> = {
  NGN: ['bank_transfer', 'card'],
  GHS: ['bank_transfer', 'mobile_money'],
  KES: ['bank_transfer', 'mobile_money'],
  UGX: ['bank_transfer', 'mobile_money'],
  ZAR: ['bank_transfer', 'card'],
  USD: ['card'],
}

const selectedCurrency = currency || 'NGN'
const allowedMethods = PAYMENT_METHODS_BY_CURRENCY[selectedCurrency] || ['card']

const fincraPayload = {
  amount: amount,
  currency: selectedCurrency,
  customer: {
    name: (name && name.trim().includes(' ')) ? name.trim() : `${(name || 'Prima').trim()} User`,
    email: email || 'user@primaplug.com',
  },
  paymentMethods: allowedMethods,
  feeBearer: 'customer',
  reference: reference,
  redirectUrl: 'https://primaplug.com/dashboard',
  metadata: { userId, purpose: 'wallet_funding' },
}
    console.log('Sending to Fincra:', JSON.stringify(fincraPayload))

    const fincraRes = await fetch('https://sandboxapi.fincra.com/checkout/payments', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('FINCRA_SECRET_KEY')!,
        'x-pub-key': Deno.env.get('FINCRA_PUBLIC_KEY')!,
      },
      body: JSON.stringify(fincraPayload),
    })

    const fincraData = await fincraRes.json()
    console.log('Fincra response:', JSON.stringify(fincraData))

    if (!fincraRes.ok || !fincraData.status) {
      console.error('Fincra error:', fincraData)
      const fincraMessage =
        fincraData?.message ||
        fincraData?.error?.message ||
        (typeof fincraData?.error === 'string' ? fincraData.error : null) ||
        `Payment provider rejected the request (${selectedCurrency})`
      await supabase.from('wallet_transactions')
        .update({ status: 'failed', description: 'Fincra rejected checkout creation' })
        .eq('fincra_reference', reference)
        .eq('status', 'pending')
      return new Response(
        JSON.stringify({ error: fincraMessage, details: fincraData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!fincraData?.data?.link) {
      // Keep the pending transaction for webhook or dashboard reconciliation;
      // the provider may have created the checkout despite a malformed response.
      throw new Error('Fincra did not return a checkout link. The transaction is pending reconciliation.')
    }

    return new Response(
      JSON.stringify({
        checkoutUrl: fincraData.data.link,
        payCode: fincraData.data.payCode,
        reference: reference,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('Function error:', e)
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
