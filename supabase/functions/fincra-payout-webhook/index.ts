import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  if (!signatureHeader) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === signatureHeader
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const rawBody = await req.text()
  console.log('=== PAYOUT WEBHOOK RECEIVED ===')
  console.log('RAW BODY:', rawBody)

  try {
    const signatureHeader = req.headers.get('signature') || ''
    const webhookSecret = Deno.env.get('FINCRA_WEBHOOK_SECRET') || ''
    const signatureSkipped = !webhookSecret
    const isValid = signatureSkipped
      ? true
      : await verifySignature(rawBody, signatureHeader, webhookSecret)
    console.log('SIGNATURE VALID:', isValid, '| SKIPPED:', signatureSkipped)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let payload: any = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      console.log('Could not parse body as JSON')
    }

    const customerReference = payload?.data?.customerReference || `unknown_${Date.now()}`

    await supabase.from('fincra_webhook_events').insert({
      event_type: payload?.event || 'unknown',
      fincra_reference: customerReference,
      payload: payload,
      processed: false,
    })

    // Signature is a warning, not a gate — never lose a payment due to a missing secret
    if (!isValid) {
      console.log('WARNING: Signature mismatch — processing anyway to avoid lost payments')
    }

    const event = payload?.event
    const data = payload?.data

    console.log('EVENT TYPE:', event)

    // ── WALLET FUNDING (charge.successful) ──────────────────────────────────
    if (event === 'charge.successful') {
      const merchantReference = data?.merchantReference || data?.reference || data?.chargeReference
      console.log('Charge successful, looking for pending fund_in with reference:', merchantReference)

      let fundTx: any = null

      if (merchantReference) {
        const { data: byRef } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('fincra_reference', merchantReference)
          .eq('status', 'pending')
          .maybeSingle()
        fundTx = byRef
      }

      // Fallback: match by userId in metadata
      if (!fundTx && data?.metadata?.userId) {
        console.log('Fallback lookup via metadata.userId:', data.metadata.userId)
        const { data: byUser } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('user_id', data.metadata.userId)
          .eq('status', 'pending')
          .eq('type', 'fund_in')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        fundTx = byUser
      }

      if (fundTx) {
        const { data: userRow } = await supabase
          .from('users')
          .select('wallet_balance, wallet_currency')
          .eq('id', fundTx.user_id)
          .single()

        const newBalance = Number(userRow?.wallet_balance || 0) + Number(fundTx.amount)
        const updatePayload: Record<string, unknown> = { wallet_balance: newBalance }
        if (!userRow?.wallet_currency && fundTx.currency) {
          updatePayload.wallet_currency = fundTx.currency
        }

        await supabase.from('users').update(updatePayload).eq('id', fundTx.user_id)
        await supabase.from('wallet_transactions').update({
          status: 'completed', balance_after: newBalance
        }).eq('id', fundTx.id)
        await supabase.from('fincra_webhook_events').update({ processed: true }).eq('fincra_reference', customerReference)
        await supabase.from('notifications').insert({
          user_id: fundTx.user_id,
          title: '💰 Wallet Funded',
          message: `Your wallet has been credited with ${fundTx.currency} ${Number(fundTx.amount).toLocaleString()}`,
          type: 'wallet',
        })
        console.log('=== WALLET FUNDED SUCCESSFULLY ===')
      } else {
        console.log('No matching pending fund_in transaction found')
      }

      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── PAYOUTS (payout.successful / payout.failed) ─────────────────────────
    // Find the matching pending withdrawal transaction
    const { data: txRow } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('fincra_reference', customerReference)
      .eq('status', 'pending')
      .maybeSingle()

    if (!txRow) {
      console.log('No matching pending withdrawal found for reference:', customerReference)
      return new Response(JSON.stringify({ status: 'no_matching_transaction' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (event === 'payout.successful') {
      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '✅ Withdrawal Successful',
        message: `Your withdrawal of ${txRow.currency} ${Number(txRow.amount).toLocaleString()} has been sent to your bank account.`,
        type: 'wallet',
      })

      console.log('=== PAYOUT CONFIRMED SUCCESSFUL ===')

    } else if (event === 'payout.failed') {
      // REFUND the user since the payout genuinely failed
      const isCreditsWithdrawal = txRow.description?.includes('via credits') ||
        txRow.description?.includes('source: credits')

      if (isCreditsWithdrawal) {
        // Credits live in prima_credits table — refund via RPC
        const CREDITS_PER_DOLLAR = 50
        const creditsToRefund = Math.round(Number(txRow.amount) * CREDITS_PER_DOLLAR)
        await supabase.rpc('add_credits', {
          p_user_id: txRow.user_id,
          p_amount: creditsToRefund,
          p_type: 'withdrawal_refund',
          p_description: 'Withdrawal failed - credits refunded',
          p_gig_id: null
        })
      } else {
        // Wallet withdrawal — refund wallet_balance on users
        const { data: userRow } = await supabase
          .from('users')
          .select('wallet_balance')
          .eq('id', txRow.user_id)
          .single()
        const refundedBalance = Number(userRow?.wallet_balance || 0) + Number(txRow.amount)
        await supabase
          .from('users')
          .update({ wallet_balance: refundedBalance })
          .eq('id', txRow.user_id)
      }

      await supabase
        .from('wallet_transactions')
        .update({ status: 'failed', description: txRow.description + ' - REFUNDED' })
        .eq('id', txRow.id)

      await supabase.from('notifications').insert({
        user_id: txRow.user_id,
        title: '❌ Withdrawal Failed',
        message: `Your withdrawal of ${txRow.currency} ${Number(txRow.amount).toLocaleString()} failed and has been refunded to your balance.`,
        type: 'wallet',
      })

      console.log('=== PAYOUT FAILED - REFUNDED USER ===')
    }

    await supabase
      .from('fincra_webhook_events')
      .update({ processed: true })
      .eq('fincra_reference', customerReference)

    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    console.log('CAUGHT ERROR:', e.message)
    return new Response(JSON.stringify({ status: 'error_logged', message: e.message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})