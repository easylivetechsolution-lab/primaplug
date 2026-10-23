import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentication required' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid user session' }, 401)

    const { creditsAmount, destinationCurrency = 'NGN', destinationCountry = 'NG', paymentScheme = null } = await req.json()
    const credits = Number(creditsAmount)
    const currency = String(destinationCurrency).toUpperCase()
    const country = String(destinationCountry).toUpperCase()
    const scheme = paymentScheme ? String(paymentScheme).toLowerCase() : null
    const supportedCurrencies = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP']
    if (!Number.isInteger(credits) || credits < 500) {
      return json({ error: 'Minimum withdrawal is 500 credits' }, 400)
    }
    if (!supportedCurrencies.includes(currency) || !/^[A-Z]{2}$/.test(country)) {
      return json({ error: 'Choose a supported payout currency and country' }, 400)
    }
    const allowedSchemes: Record<string, string[]> = {
      USD: country === 'US' ? ['ach', 'fed_wire', 'swift'] : ['swift'],
      EUR: ['sepa', 'sepa_instant'],
      GBP: ['fps', 'chaps'],
    }
    const schemesForCurrency = allowedSchemes[currency] || []
    if (schemesForCurrency.length && (!scheme || !schemesForCurrency.includes(scheme))) {
      return json({ error: 'Choose a payment scheme supported for this currency and country' }, 400)
    }
    if (!schemesForCurrency.length && scheme) {
      return json({ error: 'Payment scheme is not used for this payout route' }, 400)
    }

    const baseUrl = (Deno.env.get('FINCRA_BASE_URL') || '').replace(/\/$/, '')
    const apiKey = Deno.env.get('FINCRA_SECRET_KEY')
    const business = Deno.env.get('FINCRA_BUSINESS_ID')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const isSandbox = /sandbox/i.test(baseUrl)
    const sandboxUsers = new Set((Deno.env.get('FINCRA_CREDIT_PAYOUTS_SANDBOX_USER_IDS') || '')
      .split(',').map((id) => id.trim()).filter(Boolean))
    const sandboxUserAllowed = !isSandbox || (
      Deno.env.get('FINCRA_CREDIT_PAYOUTS_SANDBOX_ENABLED') === 'true'
      && sandboxUsers.has(user.id)
    )
    if (Deno.env.get('FINCRA_CREDIT_PAYOUTS_ENABLED') !== 'true'
      || !baseUrl || !apiKey || !business || !serviceRoleKey || !sandboxUserAllowed) {
      return json({ error: 'Credit withdrawals are not enabled for this Fincra environment' }, 503)
    }

    const usdAmount = Number((credits / 50).toFixed(2))
    const bankParams = new URLSearchParams({
      country,
      currency,
      paymentDestination: 'bank_account',
    })
    const bankResponse = await fetch(`${baseUrl}/core/banks?${bankParams.toString()}`, {
      headers: { accept: 'application/json', 'api-key': apiKey },
    })
    const bankResult = await bankResponse.json().catch(() => ({}))
    if (!bankResponse.ok || bankResult?.success === false || !Array.isArray(bankResult?.data) || bankResult.data.length === 0) {
      return json({ error: 'Fincra does not currently offer bank payouts for this country and currency' }, 400)
    }

    let quoteReference: string | null = null
    let destinationAmount = usdAmount
    let rate = 1
    let fee = 0
    let data: any = {
      sourceCurrency: 'USD', destinationCurrency: currency,
      sourceAmount: usdAmount, destinationAmount, rate, fee,
    }
    if (currency !== 'USD') {
      const quoteResponse = await fetch(`${baseUrl}/quotes/generate`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        business,
        sourceCurrency: 'USD',
        destinationCurrency: currency,
        amount: usdAmount.toFixed(2),
        action: 'send',
        transactionType: 'disbursement',
        paymentDestination: 'bank_account',
        beneficiaryType: 'individual',
        feeBearer: 'business',
        ...(scheme ? { paymentScheme: scheme } : {}),
      }),
      })
      const quoteResult = await quoteResponse.json()
      data = quoteResult?.data || {}
      quoteReference = data?.reference
      destinationAmount = Number(data?.amountToReceive ?? data?.destinationAmount)
      rate = Number(data?.rate)
      fee = Number(data?.fee ?? 0)
      if (!quoteResponse.ok || quoteResult?.success === false || !quoteReference
        || !Number.isFinite(destinationAmount) || destinationAmount <= 0
        || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(fee) || fee < 0) {
        console.error('Fincra credit quote rejected:', JSON.stringify({ status: quoteResponse.status, hasData: !!data }))
        return json({ error: quoteResult?.message || 'Could not get a payout quote. Try again.' }, 502)
      }
    }

    const serviceClient = createClient(url, serviceRoleKey)
    const { data: saved, error: saveError } = await serviceClient.rpc('create_credit_withdrawal_quote', {
      p_user_id: user.id,
      p_credits_amount: credits,
      p_usd_amount: usdAmount,
      p_destination_currency: currency,
      p_destination_country: country,
      p_payment_scheme: scheme,
      p_destination_amount: destinationAmount,
      p_exchange_rate: rate,
      p_provider_fee: fee,
      p_fincra_quote_reference: quoteReference,
      p_quote_payload: data,
    })
    if (saveError) throw saveError

    return json({
      quoteId: saved?.quote_id,
      creditsAmount: credits,
      usdAmount,
      destinationCurrency: currency,
      destinationCountry: country,
      paymentScheme: scheme,
      destinationAmount,
      exchangeRate: rate,
      providerFee: fee,
      expiresInSeconds: Number(saved?.expires_in_seconds) || 30,
      feeBearer: 'Prima',
    })
  } catch (error) {
    console.error('Credit payout quote error:', error)
    return json({ error: error.message || 'Could not generate payout quote' }, 500)
  }
})
