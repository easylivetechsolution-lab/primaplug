// The provider validates the actual country/currency/bank combination at
// runtime. This is the set of bank payout currencies Fincra documents.
export const FINCRA_BANK_PAYOUT_CURRENCIES = [
  'NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP',
]

export const FINCRA_PAYOUT_CURRENCY_LABELS = {
  NGN: '\u20A6 NGN \u2014 Nigerian Naira',
  GHS: '\u20B5 GHS \u2014 Ghanaian Cedi',
  KES: 'KSh KES \u2014 Kenyan Shilling',
  ZAR: 'R ZAR \u2014 South African Rand',
  USD: '$ USD \u2014 US Dollar',
  EUR: '\u20AC EUR \u2014 Euro',
  GBP: '\u00A3 GBP \u2014 British Pound',
}

const COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(' ')

const displayNames = typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames([typeof navigator === 'undefined' ? 'en' : navigator.language], { type: 'region' })
  : null

export const FINCRA_BANK_PAYOUT_COUNTRIES = COUNTRY_CODES
  .map(code => ({ code, name: displayNames?.of(code) || code }))
  .sort((a, b) => a.name.localeCompare(b.name))

export const getFincraPaymentSchemes = (currency, country) => {
  if (currency === 'USD') return country === 'US' ? ['ach', 'fed_wire', 'swift'] : ['swift']
  if (currency === 'EUR') return ['sepa', 'sepa_instant']
  if (currency === 'GBP') return ['fps', 'chaps']
  return []
}
