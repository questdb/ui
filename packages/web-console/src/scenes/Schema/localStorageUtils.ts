const STORAGE_KEY_PREFIX = 'questdb:expanded:';
export const TABLES_GROUP_KEY = `${STORAGE_KEY_PREFIX}tables`;
export const MATVIEWS_GROUP_KEY = `${STORAGE_KEY_PREFIX}matviews`;

export const getItemFromStorage = (key: string, defaultValue = false): boolean => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
  } catch (e) {
    return defaultValue;
  }
};

export const setItemToStorage = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
    if (!value) {
      Object.keys(localStorage).filter(k => k.startsWith(key)).forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
};

export const getSectionExpanded = (sectionKey: string): boolean => getItemFromStorage(sectionKey);
export const setSectionExpanded = (sectionKey: string, expanded: boolean): void => setItemToStorage(sectionKey, expanded)
