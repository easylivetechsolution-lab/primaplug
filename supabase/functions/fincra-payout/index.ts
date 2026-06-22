import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FINCRA_CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      userId, source, // source: 'wallet' or 'credits'
      amount, accountNumber, bankCode,
      accountName, firstName, lastName, email
    } = await req.json()

    if (!userId || !source || !amount || !accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // currency and newBalance are resolved below based on source
    let currency = 'USD'
    let newBalance: number | undefined

    if (source === 'wallet') {
      // Always read wallet_currency from DB — never trust client-supplied value
      const { data: userRow, error: userFetchError } = await supabase
        .from('users')
        .select('wallet_balance, wallet_currency')
        .eq('id', userId)
        .single()

      if (userFetchError) throw userFetchError

      currency = userRow.wallet_currency || 'USD'

      if (!FINCRA_CURRENCIES.includes(currency)) {
        return new Response(
          JSON.stringify({ error: `Wallet currency ${currency} is not supported for payouts` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const currentBalance = Number(userRow.wallet_balance || 0)
      if (currentBalance < amount) {
        return new Response(
          JSON.stringify({ error: 'Insufficient balance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      newBalance = currentBalance - amount
      await supabase
        .from('users')
        .update({ wallet_balance: newBalance })
        .eq('id', userId)
    }

    const reference = `payout_${source}_${userId}_${Date.now()}`

    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'withdrawal',
      amount: amount,
      currency: currency,
      fincra_reference: reference,
      status: 'pending',
      balance_after: newBalance,
      description: `Withdrawal via ${source} to ${bankCode}/${accountNumber}`,
    })

    const nameParts = (accountName || `${firstName || ''} ${lastName || ''}`).trim().split(' ')
    const payoutFirstName = firstName || nameParts[0] || 'Prima'
    const payoutLastName = lastName || nameParts.slice(1).join(' ') || 'User'

    const payoutPayload = {
      business: Deno.env.get('FINCRA_BUSINESS_ID'),
      sourceCurrency: currency,
      destinationCurrency: currency,
      amount: String(amount),
      description: 'Prima withdrawal',
      customerReference: reference,
      paymentDestination: 'bank_account',
      beneficiary: {
        firstName: payoutFirstName,
        lastName: payoutLastName,
        accountHolderName: accountName || `${payoutFirstName} ${payoutLastName}`,
        accountNumber: accountNumber,
        country: 'NG',
        bankCode: bankCode,
        type: 'individual',
        email: email || 'user@primaplug.com',
      },
      sender: {
        name: 'PrimaPlug',
        email: 'hello@primaplug.com',
      },
    }

    console.log('Sending payout to Fincra:', JSON.stringify(payoutPayload))

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
    console.log('Fincra payout response:', JSON.stringify(fincraData))

    if (!fincraRes.ok || fincraData.success === false) {
      // Refund wallet if payout failed to initiate
      if (source === 'wallet' && newBalance !== undefined) {
        await supabase
          .from('users')
          .update({ wallet_balance: newBalance + Number(amount) })
          .eq('id', userId)
      }

      await supabase
        .from('wallet_transactions')
        .update({ status: 'failed', description: 'Payout failed to initiate - refunded' })
        .eq('fincra_reference', reference)

      return new Response(
        JSON.stringify({ error: 'Payout failed', details: fincraData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
