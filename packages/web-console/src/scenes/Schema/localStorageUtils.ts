const STORAGE_KEY_PREFIX = 'questdb:expanded:';
export const TABLES_GROUP_KEY = `${STORAGE_KEY_PREFIX}tables`;
export const MATVIEWS_GROUP_KEY = `${STORAGE_KEY_PREFIX}matviews`;

const getItemFromStorage = (key: string, defaultValue = false): boolean => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? defaultValue : value === 'true';
  } catch (e) {
    return defaultValue;
  }
};

const setItemToStorage = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
    if (!value) {
      Object.keys(localStorage).filter(k => k.startsWith(key)).forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
};

export const getTableKey = (tableName: string): string => `${TABLES_GROUP_KEY}:${tableName}`;
export const getMatViewKey = (tableName: string): string => `${MATVIEWS_GROUP_KEY}:${tableName}`;
export const getFolderKey = (kind: 'table' | 'matview', tableName: string, folderName: string): string => 
  `${kind === 'table' ? TABLES_GROUP_KEY : MATVIEWS_GROUP_KEY}:${tableName}:${folderName.toLowerCase().replace(/\s+/g, '')}`;

export const getSectionExpanded = (sectionKey: string): boolean => getItemFromStorage(sectionKey);
export const setSectionExpanded = (sectionKey: string, expanded: boolean): void => setItemToStorage(sectionKey, expanded)

export const getTableExpanded = (tableName: string): boolean => getItemFromStorage(getTableKey(tableName));
export const setTableExpanded = (tableName: string, expanded: boolean): void => setItemToStorage(getTableKey(tableName), expanded);

export const getMatViewExpanded = (tableName: string): boolean => getItemFromStorage(getMatViewKey(tableName));
export const setMatViewExpanded = (tableName: string, expanded: boolean): void => setItemToStorage(getMatViewKey(tableName), expanded);

export const getFolderExpanded = (kind: 'table' | 'matview', tableName: string, folderName: string): boolean => getItemFromStorage(getFolderKey(kind, tableName, folderName));
export const setFolderExpanded = (kind: 'table' | 'matview', tableName: string, folderName: string, expanded: boolean): void => setItemToStorage(getFolderKey(kind, tableName, folderName), expanded);