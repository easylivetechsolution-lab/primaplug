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
    const country = url.searchParams.get('country') || 'NG'

    const fincraRes = await fetch(`https://sandboxapi.fincra.com/core/banks?country=${country}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'api-key': Deno.env.get('FINCRA_SECRET_KEY')!,
      },
    })

    const data = await fincraRes.json()

    if (!fincraRes.ok) {
      console.error('Fincra banks list error:', data)
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