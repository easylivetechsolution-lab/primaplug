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

  let serviceClient: ReturnType<typeof createClient> | null = null
  let reservedReference: string | null = null
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Authentication required' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid user session' }, 401)

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

    const {
      quoteId, accountNumber, bankCode, accountName, firstName, lastName,
      bankName, bankSwiftCode, sortCode, beneficiaryAddress, bankAddress,
    } = await req.json()
    if (!quoteId || String(accountNumber || '').trim().length < 4
      || String(accountNumber).length > 34 || !bankCode || !accountName) {
      return json({ error: 'A valid quote and complete bank details are required' }, 400)
    }

    serviceClient = createClient(url, serviceRoleKey)
    const { data: quote, error: quoteError } = await serviceClient
      .from('credit_withdrawal_quotes')
      .select('destination_currency, destination_country, payment_scheme')
      .eq('id', quoteId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (quoteError) throw quoteError
    if (!quote) return json({ error: 'Payout quote not found. Get a fresh quote.' }, 404)
    if (quote.destination_currency === 'NGN' && quote.destination_country === 'NG'
      && !/^\d{10}$/.test(String(accountNumber))) {
      return json({ error: 'A Nigerian naira account number must contain exactly 10 digits' }, 400)
    }

    const bankParams = new URLSearchParams({
      country: quote.destination_country,
      currency: quote.destination_currency,
      paymentDestination: 'bank_account',
    })
    const banksResponse = await fetch(`${baseUrl}/core/banks?${bankParams.toString()}`, {
      headers: { accept: 'application/json', 'api-key': apiKey },
    })
    const banksResult = await banksResponse.json().catch(() => ({}))
    const bank = Array.isArray(banksResult?.data)
      ? banksResult.data.find((item: any) => String(item.code) === String(bankCode))
      : null
    if (!banksResponse.ok || !bank) {
      return json({ error: 'This bank is not currently enabled for the selected Fincra route' }, 400)
    }
    if (quote.payment_scheme === 'swift' && !bankSwiftCode && !bank.swiftCode && !bank.bic) {
      return json({ error: 'Fincra requires a SWIFT/BIC code for this bank' }, 400)
    }
    if (['GHS', 'ZAR'].includes(quote.destination_currency)
      && !bankSwiftCode && !bank.swiftCode && !bank.bic) {
      return json({ error: 'Fincra requires a SWIFT/BIC code for this bank' }, 400)
    }
    if (quote.destination_currency === 'GBP' && !sortCode) {
      return json({ error: 'A valid sort code is required for GBP bank payouts' }, 400)
    }

    const isCrossBorder = quote.destination_country !== 'NG' || quote.destination_currency !== 'NGN'
    const supportingFiles = Deno.env.get('FINCRA_CREDIT_PAYOUT_FILES_URL')
    const senderJson = Deno.env.get('FINCRA_CREDIT_PAYOUT_SENDER_JSON')
    let sender: Record<string, unknown> | null = null
    if (senderJson) {
      try { sender = JSON.parse(senderJson) } catch { return json({ error: 'Fincra sender payout settings are invalid' }, 503) }
    }
    if (quote.destination_currency === 'USD' && !supportingFiles) {
      return json({ error: 'USD payouts need the configured supporting document URL' }, 503)
    }
    if (isCrossBorder && !sender) {
      return json({ error: 'Fincra international sender details are not configured' }, 503)
    }
    if (quote.payment_scheme === 'swift'
      && (!beneficiaryAddress?.street || !beneficiaryAddress?.city || !beneficiaryAddress?.state || !beneficiaryAddress?.zip
        || !bankAddress?.street || !bankAddress?.city || !bankAddress?.state || !bankAddress?.zip)) {
      return json({ error: 'Complete the beneficiary and bank addresses required for SWIFT' }, 400)
    }

    const reference = `credit_payout_${quoteId}`
    const { data: reservation, error: reserveError } = await serviceClient.rpc('reserve_credit_withdrawal', {
      p_user_id: user.id,
      p_quote_id: quoteId,
      p_fincra_reference: reference,
    })
    if (reserveError) throw reserveError
    if (reservation?.status === 'quote_expired') return json({ error: 'This quote expired. Get a new quote to continue.' }, 409)
    if (reservation?.status === 'insufficient_credits') return json({ error: 'Insufficient credits balance' }, 400)
    if (reservation?.status === 'credit_balance_mismatch') return json({ error: 'Credit balance needs reconciliation. Contact support before retrying.' }, 409)
    if (!['reserved', 'pending'].includes(reservation?.status)) {
      return json({ error: `Withdrawal could not be reserved (${reservation?.status || 'unknown'})` }, 409)
    }

    reservedReference = reservation.reference || reference
    if (reservation.already_reserved) {
      return json({ status: reservation.status, reference: reservedReference,
        message: 'This withdrawal is already being processed.' }, 202)
    }

    const fullName = String(accountName).trim()
    const names = fullName.split(/\s+/)
    const payoutPayload: Record<string, unknown> = {
      business,
      sourceCurrency: reservation.source_currency,
      destinationCurrency: reservation.destination_currency,
      amount: Number(reservation.usd_amount),
      ...(reservation.quote_reference ? { quoteReference: reservation.quote_reference } : {}),
      ...(reservation.payment_scheme ? { paymentScheme: reservation.payment_scheme } : {}),
      description: 'Prima credits withdrawal',
      ...(reservation.destination_currency === 'USD' && supportingFiles ? { files: supportingFiles } : {}),
      paymentDestination: 'bank_account',
      customerReference: reservedReference,
      beneficiary: {
        firstName: firstName || names[0] || 'Prima',
        lastName: lastName || names.slice(1).join(' ') || 'User',
        accountHolderName: fullName,
        accountNumber: String(accountNumber).trim(),
        bankCode: String(bankCode),
        bankName: bankName || bank.name,
        ...(bankSwiftCode || bank.swiftCode || bank.bic
          ? { bankSwiftCode: bankSwiftCode || bank.swiftCode || bank.bic } : {}),
        ...(quote.destination_currency === 'GBP' ? { sortCode: String(sortCode) } : {}),
        country: reservation.destination_country,
        type: 'individual',
        email: user.email || 'user@primaplug.com',
        ...(reservation.payment_scheme === 'swift' ? {
          address: { ...beneficiaryAddress, country: reservation.destination_country },
        } : {}),
      },
      ...(sender ? { sender } : {}),
      ...(reservation.payment_scheme === 'swift' ? {
        bankAddress: { ...bankAddress, country: reservation.destination_country },
      } : {}),
    }

    let payoutResponse: Response
    try {
      payoutResponse = await fetch(`${baseUrl}/disbursements/payouts`, {
        method: 'POST',
        headers: { accept: 'application/json', 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify(payoutPayload),
      })
    } catch (networkError) {
      // The provider may have accepted the payout before the connection failed.
      // Keep the credit reservation pending for webhook/reconciliation; never auto-refund here.
      console.error('Fincra payout connection uncertain:', JSON.stringify({ reference: reservedReference }))
      return json({ status: 'pending', reference: reservedReference,
        message: 'Payout status is being confirmed. Do not submit it again.' }, 202)
    }

    const payoutResult = await payoutResponse.json().catch(() => ({}))
    if (payoutResponse.status === 409) {
      return json({ status: 'pending', reference: reservedReference,
        message: 'Payout is already registered and will be reconciled.' }, 202)
    }
    if (!payoutResponse.ok || payoutResult?.success === false) {
      if (payoutResponse.status >= 500) {
        return json({ status: 'pending', reference: reservedReference,
          message: 'Payout status is being confirmed. Do not submit it again.' }, 202)
      }
      const { data: settlement, error: settleError } = await serviceClient.rpc('process_credit_fincra_payout', {
        p_reference: reservedReference,
        p_success: false,
        p_conversion_success: typeof payoutResult?.data?.isConversionSuccessful === 'boolean'
          ? payoutResult.data.isConversionSuccessful : null,
      })
      if (settleError) throw settleError
      if (settlement?.status === 'recovery_required') {
        return json({ status: 'recovery_required', reference: reservedReference,
          message: 'Fincra may have completed the currency conversion. Your credits remain reserved while the payout is reconciled.' }, 202)
      }
      return json({ error: payoutResult?.message || 'Payout was declined; credits were refunded.' }, 502)
    }

    return json({ status: 'initiated', reference: reservedReference,
      fincraId: payoutResult?.data?.id, message: 'Withdrawal is being processed.' }, 202)
  } catch (error) {
    console.error('Credit payout error:', error)
    // If a reservation exists and provider state is uncertain, leave it pending.
    return json({ error: error.message || 'Payout status could not be confirmed',
      ...(reservedReference ? { status: 'pending', reference: reservedReference } : {}) }, reservedReference ? 202 : 500)
  }
})
