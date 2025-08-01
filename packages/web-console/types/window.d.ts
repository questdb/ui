declare global {
  interface Crypto {
    randomUUID: () => string
  }
  interface Window {
    crypto: Crypto
  }
}