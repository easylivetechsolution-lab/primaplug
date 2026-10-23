import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useAuth } from './AuthContext'
import { t as translate } from '../data/translations'
import { CURRENCIES, getCurrency } from '../data/currencies'
import { normalizeLanguage } from '../data/languages'
import { currencyForLocation } from '../utils/locationCurrency'

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
  const preferenceVersion = useRef(0)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    let active = true
    const requestedVersion = preferenceVersion.current
    const applyPreferences = (preferences = {}) => {
      if (!active || requestedVersion !== preferenceVersion.current) return
      const nextLanguage = normalizeLanguage(
        preferences.language || profile?.language || localStorage.getItem('prima_language') || 'en'
      )
      const storedCurrency = preferences.preferred_currency || profile?.preferred_currency ||
        localStorage.getItem('prima_currency')
      const nextCurrency = CURRENCIES.some(item => item.code === storedCurrency)
        ? storedCurrency
        : profile?.location
          ? currencyForLocation(profile.location, 'USD')
          : 'USD'
      setLanguageState(nextLanguage)
      setCurrencyState(nextCurrency)
      localStorage.setItem('prima_language', nextLanguage)
      localStorage.setItem('prima_currency', nextCurrency)
    }

    if (!user?.id) {
      applyPreferences()
      return () => { active = false }
    }

    supabase.from('user_preferences')
      .select('language, preferred_currency')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('Could not load saved language and currency preferences:', error)
        applyPreferences(data || {})
      })

    return () => { active = false }
  }, [user?.id, profile?.language, profile?.preferred_currency, profile?.location])

  const setLanguage = async (code) => {
    const normalizedLanguage = normalizeLanguage(code)
    preferenceVersion.current += 1
    setLanguageState(normalizedLanguage)
    localStorage.setItem('prima_language', normalizedLanguage)
    if (user) {
      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        language: normalizedLanguage,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      return { error }
    }
    return { error: null }
  }

  const setCurrency = async (code) => {
    const normalizedCurrency = CURRENCIES.some(item => item.code === code) ? code : 'USD'
    preferenceVersion.current += 1
    setCurrencyState(normalizedCurrency)
    localStorage.setItem('prima_currency', normalizedCurrency)
    if (user) {
      const { error } = await supabase.from('user_preferences').upsert({
        user_id: user.id,
        preferred_currency: normalizedCurrency,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      return { error }
    }
    return { error: null }
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
