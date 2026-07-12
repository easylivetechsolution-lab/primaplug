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
      userId, source, currency: requestedCurrency,
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

    let currency = requestedCurrency || 'NGN'
    let newBalance: number | undefined

    if (source === 'wallet') {
      // Validate currency is Fincra-supported
      if (!FINCRA_CURRENCIES.includes(currency)) {
        return new Response(
          JSON.stringify({ error: `Currency ${currency} is not supported for payouts` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Read balance from wallets table — never trust client-supplied balance
      const { data: walletRow, error: walletErr } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .eq('currency', currency)
        .maybeSingle()

      if (walletErr) throw walletErr

      if (!walletRow) {
        return new Response(
          JSON.stringify({ error: `No ${currency} wallet found` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const currentBalance = Number(walletRow.balance || 0)
      if (currentBalance < amount) {
        return new Response(
          JSON.stringify({ error: 'Insufficient balance' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Atomically debit the wallet
      const { data: debitedBal, error: debitErr } = await supabase.rpc('_debit_wallet', {
        p_user_id:  userId,
        p_currency: currency,
        p_amount:   Number(amount),
      })
      if (debitErr) throw debitErr
      if (debitedBal === null) {
        return new Response(
          JSON.stringify({ error: 'Insufficient balance (concurrent update)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      newBalance = debitedBal as number
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
      amount: Number(amount),
      description: 'Prima withdrawal',
      customerReference: reference,
      paymentDestination: 'bank_account',
      beneficiary: {
        firstName: payoutFirstName,
        lastName: payoutLastName,
        accountHolderName: accountName || `${payoutFirstName} ${payoutLastName}`,
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
      // Refund the wallet if payout failed to initiate
      if (source === 'wallet' && newBalance !== undefined) {
        await supabase.rpc('_credit_wallet', {
          p_user_id:  userId,
          p_currency: currency,
          p_amount:   Number(amount),
        })
      }

      await supabase
        .from('wallet_transactions')
        .update({ status: 'failed', description: 'Payout failed to initiate - refunded' })
        .eq('fincra_reference', reference)

      const fincraMessage = fincraData?.message || fincraData?.error || 'Payment provider declined the transfer'
      return new Response(
        JSON.stringify({ error: fincraMessage, details: fincraData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
