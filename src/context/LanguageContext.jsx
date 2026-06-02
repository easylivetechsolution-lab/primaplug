import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { useAuth } from './AuthContext'
import { t as translate } from '../data/translations'
import { getCurrency } from '../data/currencies'
import { normalizeLanguage } from '../data/languages'

const LanguageContext = createContext({})

export const useLanguage = () => useContext(LanguageContext)

export const LanguageProvider = ({ children }) => {
  const { user, profile } = useAuth()
  const [language, setLanguageState] = useState(
    normalizeLanguage(localStorage.getItem('prima_language') || 'en')
  )
  const [currency, setCurrencyState] = useState(
    localStorage.getItem('prima_currency') || 'USD'
  )

  useEffect(() => {
    if (profile?.language) {
      const normalizedLanguage = normalizeLanguage(profile.language)
      setLanguageState(normalizedLanguage)
      localStorage.setItem('prima_language', normalizedLanguage)
    }
  }, [profile])

  const setLanguage = async (code) => {
    const normalizedLanguage = normalizeLanguage(code)
    setLanguageState(normalizedLanguage)
    localStorage.setItem('prima_language', normalizedLanguage)
    if (user) {
      await supabase
        .from('users')
        .update({ language: normalizedLanguage })
        .eq('id', user.id)
    }
  }

  const setCurrency = async (code) => {
    setCurrencyState(code)
    localStorage.setItem('prima_currency', code)
    if (user) {
      await supabase
        .from('users')
        .update({ preferred_currency: code })
        .eq('id', user.id)
    }
  }

  const t = (key) => translate(language, key)

  const formatAmount = (amount, currencyCode) => {
    const curr = getCurrency(currencyCode || currency)
    return `${curr.symbol}${Number(amount).toLocaleString()}`
  }

  return (
    <LanguageContext.Provider value={{
      language, setLanguage,
      currency, setCurrency,
      t, formatAmount
    }}>
      {children}
    </LanguageContext.Provider>
  )
}
