import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      amount,
      currency = 'NGN',
      email,
      name,
      user_id,
      type = 'wallet',
      commission_id,
    } = await req.json()

    if (!amount || Number(amount) <= 0) return json({ error: 'Valid amount required' }, 400)
    if (!user_id) return json({ error: 'user_id required' }, 400)

    const secretKey = Deno.env.get('FINCRA_SECRET_KEY')
    const baseUrl = Deno.env.get('FINCRA_BASE_URL') || 'https://api.fincra.com'
    const redirectUrl = Deno.env.get('FINCRA_REDIRECT_URL') || ''

    if (!secretKey) return json({ error: 'Fincra is not configured' }, 500)

    const reference = `PRIMA-${type.toUpperCase()}-${commission_id || user_id}-${Date.now()}`

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (type === 'wallet') {
      await supabase.from('wallet_transactions').insert({
        user_id,
        type: 'fund_in',
        amount,
        currency,
        fincra_reference: reference,
        status: 'pending',
        description: 'Wallet funding via Fincra',
      })
    }

    const response = await fetch(`${baseUrl}/checkout/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency,
        customer: { email, name },
        reference,
        redirectUrl,
        metadata: { user_id, type, commission_id },
      }),
    })

    const data = await response.json()
    if (!response.ok) return json({ error: 'Fincra checkout failed', details: data }, 502)

    return json({
      reference,
      checkout_url: data?.data?.checkoutUrl || data?.data?.paymentLink || data?.checkoutUrl || data?.paymentLink,
      raw: data,
    })
  } catch (error) {
    console.error('fincra-create-payin error:', error)
    return json({ error: error.message }, 500)
  }
})
