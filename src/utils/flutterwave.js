export const payWithFlutterwave = (options) => {
  const {
    publicKey, amount, currency = 'NGN',
    email, name, phone = '', txRef,
    description, title = 'PrimaPlug',
    onSuccess, onClose,
  } = options

  const launch = () => {
    window.FlutterwaveCheckout({
      public_key: publicKey,
      tx_ref: txRef || `PRIMA-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      currency,
      payment_options: 'card, banktransfer, ussd, opay, mobilemoney',
      customer: {
        email,
        name,
        phone_number: phone,
      },
      customizations: {
        title,
        description,
        logo: 'https://primaplug.com/prima-icon.png',
      },
      callback: (response) => {
        console.log('Flutterwave response:', response)
        if (
          response.status === 'successful' ||
          response.status === 'completed'
        ) {
          onSuccess && onSuccess(response)
        }
      },
      onclose: () => {
        onClose && onClose()
      },
    })
  }

  if (window.FlutterwaveCheckout) {
    launch()
  } else {
    const script = document.createElement('script')
    script.src = 'https://checkout.flutterwave.com/v3.js'
    script.onload = () => launch()
    script.onerror = () => alert('Payment system failed to load. Check your internet connection.')
    document.head.appendChild(script)
  }
}

// Verify payment via Supabase Edge Function
export const verifyFlutterwavePayment = async (txRef, supabase) => {
  try {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: { tx_ref: txRef }
    })
    if (error) throw error
    return data
  } catch (e) {
    console.error('Verify payment error:', e)
    return null
  }
}