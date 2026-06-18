import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  return new Response(
    JSON.stringify({
      error: 'Fincra payout creation needs exact beneficiary/transfer payload mapping before live payouts are enabled.',
    }),
    { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
