import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { accountNumber, bankCode } = await req.json()

    if (!accountNumber || !bankCode) {
      return new Response(
        JSON.stringify({ error: 'accountNumber and bankCode are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const baseUrl = (Deno.env.get('FINCRA_BASE_URL') || 'https://sandboxapi.fincra.com').replace(/\/$/, '')
    const apiKey = Deno.env.get('FINCRA_SECRET_KEY')
    if (!apiKey) throw new Error('Fincra is not configured')
    const fincraRes = await fetch(`${baseUrl}/core/accounts/resolve`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        accountNumber,
        bankCode,
        type: 'nuban',
      }),
    })

    const data = await fincraRes.json()
    console.log('Account verify response:', JSON.stringify(data))

    if (!fincraRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Could not verify account', details: data }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(data),
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
