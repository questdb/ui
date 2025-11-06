import { Locale } from "date-fns"
import { enGB, enUS, fr, es, de, ja, ko, zhCN } from "date-fns/locale"

/**
 * Function to retrieve a date-fns Locale object based on a specified language code.
 *
 * This function takes a language code as input and returns the corresponding date-fns Locale object.
 * It uses a predefined mapping of language codes to Locale objects. If the input language code is not found
 * in the mapping, it defaults to the English (United States) Locale.
 *
 * @param {string} language - The language code (e.g., "en-US", "fr-FR", "es-ES") for which to retrieve the Locale.
 * @returns {Locale} The date-fns Locale object corresponding to the input language code, or the English (United States) Locale as the default.
 */
export const getLocaleFromLanguage = (language: string) => {
  const localeMap: { [key: string]: Locale } = {
    "en-GB": enGB, // English (United Kingdom)
    "en-US": enUS, // English (United States)
    "fr-FR": fr, // French (France)
    "es-ES": es, // Spanish (Spain)
    "de-DE": de, // German (Germany)
    "ja-JP": ja, // Japanese (Japan)
    "ko-KR": ko, // Korean (South Korea),
    "zh-CN": zhCN, // Chinese (Simplified, China)
    // add more language support here
  }

  // If the language is not found in the map, default to English (United States)
  return localeMap[language] || enUS
}
