import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const country = url.searchParams.get('country')
    const currency = url.searchParams.get('currency')
    const paymentDestination = url.searchParams.get('paymentDestination') || 'bank_account'
    if (!country && !currency) {
      return new Response(JSON.stringify({ error: 'Country or currency is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (country && !/^[A-Z]{2}$/.test(country.toUpperCase())) {
      return new Response(JSON.stringify({ error: 'Country must be an ISO alpha-2 code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!['bank_account'].includes(paymentDestination)) {
      return new Response(JSON.stringify({ error: 'Unsupported payout method' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const baseUrl = (Deno.env.get('FINCRA_BASE_URL') || 'https://sandboxapi.fincra.com').replace(/\/$/, '')
    const apiKey = Deno.env.get('FINCRA_SECRET_KEY')
    if (!apiKey) throw new Error('Fincra is not configured')
    const params = new URLSearchParams({ paymentDestination })
    if (country) params.set('country', country.toUpperCase())
    if (currency) params.set('currency', currency.toUpperCase())

    const fincraRes = await fetch(
      `${baseUrl}/core/banks?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'connection': 'close',
        },
      }
    )

    // Read body using stream to avoid "error reading a body from connection" on .text()
    let rawText = ''
    if (fincraRes.body) {
      const reader = fincraRes.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        rawText += decoder.decode(value, { stream: true })
      }
      rawText += decoder.decode()
    }

    let data: unknown
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('Fincra non-JSON response:', rawText.slice(0, 300))
      return new Response(
        JSON.stringify({ error: 'Invalid response from payment provider', raw: rawText.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!fincraRes.ok) {
      console.error('Fincra banks error:', data)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch banks', details: data }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
