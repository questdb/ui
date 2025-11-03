const STORAGE_KEY_PREFIX = "questdb:expanded:"
export const TABLES_GROUP_KEY = `${STORAGE_KEY_PREFIX}tables`
export const MATVIEWS_GROUP_KEY = `${STORAGE_KEY_PREFIX}matviews`

export const getItemFromStorage = (key: string): boolean => {
  try {
    const value = localStorage.getItem(key)
    if (value === null) {
      if (TABLES_GROUP_KEY === key) {
        setItemToStorage(key, true)
        return true
      }
      return false
    }
    return value === "true"
  } catch (e) {
    return false
  }
}

export const setItemToStorage = (key: string, value: boolean): string[] => {
  try {
    localStorage.setItem(key, value ? "true" : "false")
    if (!value) {
      const modifiedKeys = Object.keys(localStorage).filter(
        (k) => k.startsWith(key) && k !== key,
      )

      modifiedKeys.forEach((k) => localStorage.removeItem(k))
      return [key, ...modifiedKeys]
    }
    return [key]
  } catch (e) {
    console.warn("Failed to save to localStorage:", e)
    return [key]
  }
}

export const getSectionExpanded = (sectionKey: string): boolean =>
  getItemFromStorage(sectionKey)
export const setSectionExpanded = (
  sectionKey: string,
  expanded: boolean,
): string[] => setItemToStorage(sectionKey, expanded)
