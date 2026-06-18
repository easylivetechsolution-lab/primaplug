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
    const { userId, amount, currency, email, name } = await req.json()
    console.log('Received body:', JSON.stringify({ userId, amount, currency, email, name }))

    if (!userId || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid userId/amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const reference = `wallet_${userId}_${Date.now()}`

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
  redirectUrl: 'https://primaplug.com/wallet?status=callback',
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
      return new Response(
        JSON.stringify({ error: 'Fincra request failed', details: fincraData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'fund_in',
      amount: amount,
      currency: currency || 'NGN',
      fincra_reference: reference,
      status: 'pending',
      description: 'Wallet funding initiated',
    })

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