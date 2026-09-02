import { deleteEncryptedSecret, getEncryptedSecret, putEncryptedSecret } from "@/lib/storage"

const ITERATIONS = 600_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const SESSION_KEY = "rps-obe-openrouter-session"

function toBase64(bytes: Uint8Array) {
  let value = ""
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function asArrayBuffer(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer
}

function requireWebCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto tidak tersedia pada browser/konteks ini. Gunakan mode memory atau session.")
  return globalThis.crypto
}

async function deriveKey(pin: string, salt: Uint8Array, iterations: number) {
  const webCrypto = requireWebCrypto()
  const keyMaterial = await webCrypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveKey"])
  return webCrypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asArrayBuffer(salt), iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export function isWebCryptoAvailable() {
  return Boolean(globalThis.crypto?.subtle)
}

export async function saveEncryptedApiKey(apiKey: string, pin: string) {
  if (!apiKey.trim()) throw new Error("Masukkan OpenRouter API key terlebih dahulu.")
  if (pin.length < 6) throw new Error("PIN/passphrase minimal 6 karakter.")
  const webCrypto = requireWebCrypto()
  const salt = webCrypto.getRandomValues(new Uint8Array(16))
  const iv = webCrypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(pin, salt, ITERATIONS)
  const ciphertext = await webCrypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, key, encoder.encode(apiKey.trim()))
  await putEncryptedSecret({
    key: "openrouter",
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA-256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  })
}

export async function unlockEncryptedApiKey(pin: string) {
  if (!pin) throw new Error("Masukkan PIN/passphrase untuk membuka API key.")
  const secret = await getEncryptedSecret()
  if (!secret) throw new Error("API key terenkripsi belum tersimpan di perangkat ini.")
  try {
    const key = await deriveKey(pin, fromBase64(secret.salt), secret.iterations)
    const plaintext = await requireWebCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(fromBase64(secret.iv)) },
      key,
      asArrayBuffer(fromBase64(secret.ciphertext)),
    )
    return decoder.decode(plaintext)
  } catch {
    throw new Error("PIN/passphrase salah atau data credential rusak.")
  }
}

export async function hasEncryptedApiKey() {
  return Boolean(await getEncryptedSecret())
}

export async function forgetEncryptedApiKey() {
  await deleteEncryptedSecret()
}

export function readSessionApiKey() {
  try { return window.sessionStorage.getItem(SESSION_KEY) ?? "" } catch { return "" }
}

export function writeSessionApiKey(value: string) {
  try {
    if (value.trim()) window.sessionStorage.setItem(SESSION_KEY, value.trim())
    else window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    throw new Error("Browser menolak session storage. Gunakan mode hanya tab ini.")
  }
}

export function clearSessionApiKey() {
  try { window.sessionStorage.removeItem(SESSION_KEY) } catch { /* storage may be disabled */ }
}
