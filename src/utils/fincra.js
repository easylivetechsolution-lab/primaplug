import { edgeFunctionErrorMessage } from './edgeFunctionErrors'

export const startFincraWalletFunding = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-fund-wallet', {
    body: {
      userId: payload.user_id,
      amount: payload.amount,
      currency: payload.currency,
      relatedCommissionId: payload.related_commission_id || null,
      email: payload.email,
      name: payload.name,
    },
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not start wallet funding. Please try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export const requestFincraPayout = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-payout', {
    body: payload,
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not start the withdrawal. Please try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export const quoteFincraCreditPayout = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-credit-payout-quote', {
    body: {
      creditsAmount: payload.creditsAmount,
      destinationCurrency: payload.destinationCurrency || 'NGN',
      destinationCountry: payload.destinationCountry || 'NG',
      paymentScheme: payload.paymentScheme || null,
    },
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not get a payout quote. Please try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export const requestFincraCreditPayout = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-credit-payout', {
    body: payload,
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not submit the withdrawal. Please check your withdrawal history before retrying.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export const listFincraBanks = async (supabase, country = 'NG', currency, paymentDestination = 'bank_account') => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  const params = new URLSearchParams({ country, paymentDestination })
  if (currency) params.set('currency', currency)

  const res = await fetch(
    `https://eiwytpjtrawmocinxpid.supabase.co/functions/v1/fincra-list-banks?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    }
  )
  const json = await res.json()
  if (json?.error) throw new Error(json.error)
  return json
}

export const verifyFincraAccount = async (supabase, accountNumber, bankCode) => {
  const { data, error } = await supabase.functions.invoke('fincra-verify-account', {
    body: { accountNumber, bankCode },
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not verify this account. Check the details and try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

export const verifyFincraPayment = async (supabase, reference) => {
  const { data, error } = await supabase.functions.invoke('fincra-verify-payment', {
    body: { reference },
  })

  if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not verify this payment. Please try again.'))
  if (data?.error) throw new Error(data.error)
  return data
}

