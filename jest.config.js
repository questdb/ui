module.exports = {
  testMatch: [
    "**/src/**/__tests__/**/*.{ts,tsx,js}",
    "**/src/**/*.{spec,test}.{ts,tsx,js}",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/e2e/",
    "/dist/",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
}
