import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BOOST_PRICES: Record<string, Record<number, number>> = {
  NGN: { 7: 1500, 14: 2500, 30: 4000 },
  USD: { 7: 1.00, 14: 2.00, 30: 3.00 },
  GHS: { 7: 15,   14: 25,   30: 40   },
  KES: { 7: 130,  14: 220,  30: 350  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { serviceId, days, currency, email, serviceName } = await req.json()

    if (!serviceId || !days || !currency) {
      return new Response(JSON.stringify({ error: 'Missing serviceId, days, or currency' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const validDays = [7, 14, 30]
    if (!validDays.includes(Number(days))) {
      return new Response(JSON.stringify({ error: 'days must be 7, 14, or 30' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const currencyPrices = BOOST_PRICES[currency]
    if (!currencyPrices) {
      return new Response(JSON.stringify({ error: `Currency ${currency} not supported for boosts` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const price = currencyPrices[Number(days)]

    // Create Supabase client with user's JWT to verify ownership
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify the user owns this service
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id, worker_id, title')
      .eq('id', serviceId)
      .maybeSingle()

    if (svcErr || !svc) {
      return new Response(JSON.stringify({ error: 'Service not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (svc.worker_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized to boost this service' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const reference = `boost_${serviceId}_${Date.now()}`

    // Record a pending transaction so the webhook can activate the boost
    await supabase.from('wallet_transactions').insert({
      user_id:     user.id,
      service_id:  serviceId,
      type:        'boost',
      amount:      price,
      currency:    currency,
      status:      'pending',
      description: `Service boost — ${days} days`,
      fincra_reference: reference,
    })

    const PAYMENT_METHODS: Record<string, string[]> = {
      NGN: ['bank_transfer', 'card'],
      GHS: ['bank_transfer', 'mobile_money'],
      KES: ['bank_transfer', 'mobile_money'],
      USD: ['card'],
    }

    const fincraPayload = {
      amount:   price,
      currency: currency,
      customer: {
        name:  'Prima Boost',
        email: email || 'boost@primaplug.com',
      },
      paymentMethods: PAYMENT_METHODS[currency] || ['card'],
      feeBearer:      'customer',
      reference:      reference,
      redirectUrl:    'https://primaplug.com/services',
      metadata: {
        userId:    user.id,
        serviceId: serviceId,
        days:      Number(days),
        purpose:   'boost',
      },
    }

    const fincraRes = await fetch('https://sandboxapi.fincra.com/checkout/payments', {
      method: 'POST',
      headers: {
        'accept':       'application/json',
        'Content-Type': 'application/json',
        'api-key':      Deno.env.get('FINCRA_SECRET_KEY')!,
        'x-pub-key':    Deno.env.get('FINCRA_PUBLIC_KEY')!,
      },
      body: JSON.stringify(fincraPayload),
    })

    const fincraData = await fincraRes.json()
    console.log('Fincra boost response:', JSON.stringify(fincraData))

    if (!fincraRes.ok || !fincraData.status) {
      const msg =
        fincraData?.message ||
        fincraData?.error?.message ||
        (typeof fincraData?.error === 'string' ? fincraData.error : null) ||
        'Payment provider rejected the request'
      return new Response(JSON.stringify({ error: msg, details: fincraData }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      checkoutUrl: fincraData.data.link,
      reference:   reference,
      price:       price,
      currency:    currency,
      days:        Number(days),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    console.error('Boost function error:', e)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
