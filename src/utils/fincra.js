export const startFincraWalletFunding = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-create-payin', {
    body: payload,
  })

  if (error) throw error
  return data
}

export const requestFincraPayout = async (supabase, payload) => {
  const { data, error } = await supabase.functions.invoke('fincra-create-payout', {
    body: payload,
  })

  if (error) throw error
  return data
}
