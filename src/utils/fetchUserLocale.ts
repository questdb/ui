/**
 * Function to determine the user's preferred language or locale using the `navigator` object.
 * @returns {string} The user's preferred language or locale.
 */
export const fetchUserLocale = () => {
  return navigator.languages && navigator.languages.length
    ? navigator.languages[0]
    : navigator.language
}
