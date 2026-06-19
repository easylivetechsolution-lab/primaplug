export const startFincraWalletFunding = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-fund-wallet', {
    body: {
      userId: payload.user_id,
      amount: payload.amount,
      currency: payload.currency,
      email: payload.email,
      name: payload.name,
    },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const requestFincraPayout = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-payout', {
    body: payload,
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const listFincraBanks = async (supabase, country = 'NG') => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  const res = await fetch(
    `https://eiwytpjtrawmocinxpid.supabase.co/functions/v1/fincra-list-banks?country=${country}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
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

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}