import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FINCRA_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP']
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  NGN: 'NG', GHS: 'GH', KES: 'KE', ZAR: 'ZA',
  USD: 'US', EUR: 'DE', GBP: 'GB'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      userId: requestedUserId, source, currency: requestedCurrency,
      amount, accountNumber, bankCode,
      accountName, firstName, lastName, email
    } = await req.json()

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

    // Credits withdrawals are disabled until the NGN conversion rate and
    // the credit debit can be handled atomically with payout creation.
    if (source !== 'wallet') {
      return new Response(
        JSON.stringify({ error: 'Only wallet withdrawals are currently available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!source || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let currency = requestedCurrency || 'NGN'
    if (!FINCRA_CURRENCIES.includes(currency)) {
      return new Response(
        JSON.stringify({ error: `Currency ${currency} is not supported for payouts` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const reference = `payout_${source}_${userId}_${Date.now()}`
    const { data: reservation, error: reserveError } = await supabase.rpc(
      'reserve_fincra_wallet_withdrawal',
      {
        p_user_id: userId,
        p_currency: currency,
        p_amount: Number(amount),
        p_reference: reference,
        p_description: `Withdrawal via wallet to ${bankCode}`,
      },
    )
    if (reserveError) throw reserveError
    if (reservation?.status !== 'reserved') {
      return new Response(JSON.stringify({ error: 'Insufficient wallet balance' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payoutPayload = {
      business: Deno.env.get('FINCRA_BUSINESS_ID'),
      sourceCurrency: currency,
      destinationCurrency: currency,
      amount: Number(amount),
      description: 'Prima withdrawal',
      customerReference: reference,
      paymentDestination: 'bank_account',
      beneficiary: {
        firstName: firstName || (accountName || 'Prima User').trim().split(' ')[0],
        lastName: lastName || (accountName || 'Prima User').trim().split(' ').slice(1).join(' ') || 'User',
        accountHolderName: accountName || `${firstName || 'Prima'} ${lastName || 'User'}`,
        accountNumber: accountNumber,
        country: CURRENCY_TO_COUNTRY[currency] || 'NG',
        bankCode: bankCode,
        type: 'individual',
        email: email || 'user@primaplug.com',
      },
      sender: {
        name: 'PrimaPlug',
        email: 'hello@primaplug.com',
      },
    }
    console.log('Sending wallet payout to Fincra:', JSON.stringify({ reference, currency, amount: Number(amount), bankCode }))

    const fincraRes = await fetch('https://sandboxapi.fincra.com/disbursements/payouts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('FINCRA_SECRET_KEY')!,
      },
      body: JSON.stringify(payoutPayload),
    })

    const fincraData = await fincraRes.json()
    console.log('Fincra payout response:', JSON.stringify({ reference, success: fincraRes.ok && fincraData.success !== false }))

    if (!fincraRes.ok || fincraData.success === false) {
      const { error: settleError } = await supabase.rpc('process_fincra_wallet_payout', {
        p_reference: reference,
        p_success: false,
      })
      if (settleError) throw settleError

      const fincraMessage = fincraData?.message || fincraData?.error || 'Payment provider declined the transfer'
      return new Response(
        JSON.stringify({ error: fincraMessage, details: fincraData }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        status: 'initiated',
        reference: reference,
        fincraId: fincraData.data?.id,
        message: 'Withdrawal is being processed'
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
