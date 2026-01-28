// src/lib/shopifyAuth.ts
// ✅ Sistema OAuth con cache per Shopify Admin API (token valido 24h)

type TokenCache = {
  token: string
  expiresAt: number
}

let cachedToken: TokenCache | null = null

/**
 * Ottiene un Admin API access token per Shopify usando OAuth client_credentials.
 * Il token viene cachato per ~20 ore (scade dopo 24h).
 * 
 * @param shopDomain - es. "rx3ehh-wa.myshopify.com"
 * @param clientId - Client ID dell'app Shopify custom
 * @param clientSecret - Client Secret dell'app Shopify custom
 * @returns Token Admin API (shpat_...)
 */
export async function getShopifyAccessToken(
  shopDomain: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const now = Date.now()

  // ✅ Riutilizza token dalla cache se ancora valido (margine: 4 ore)
  if (cachedToken && cachedToken.expiresAt > now + 14400000) {
    console.log('[shopifyAuth] ✅ Token riutilizzato dalla cache')
    return cachedToken.token
  }

  // ✅ Richiedi nuovo token OAuth
  console.log('[shopifyAuth] 🔄 Richiesta nuovo token OAuth...')

  const url = `https://${shopDomain}/admin/oauth/access_token`
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[shopifyAuth] ❌ Errore OAuth:', response.status, errorText)
      throw new Error(`Shopify OAuth failed: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    if (!data.access_token) {
      console.error('[shopifyAuth] ❌ Risposta senza access_token:', data)
      throw new Error('Token non ottenuto da Shopify')
    }

    // ✅ Cachalo per 20 ore (scade dopo 24, margine 4h)
    const expiresIn = data.expires_in || 86400 // default 24h
    cachedToken = {
      token: data.access_token,
      expiresAt: now + (expiresIn - 14400) * 1000, // -4h di margine
    }

    console.log('[shopifyAuth] ✅ Nuovo token ottenuto e cachato')
    console.log(`[shopifyAuth] ⏱️  Valido fino a: ${new Date(cachedToken.expiresAt).toISOString()}`)

    return data.access_token
  } catch (error: any) {
    console.error('[shopifyAuth] ❌ Errore nella richiesta token:', error.message)
    throw error
  }
}

/**
 * Resetta la cache del token (utile per testing o invalidazione manuale)
 */
export function resetTokenCache(): void {
  cachedToken = null
  console.log('[shopifyAuth] 🗑️  Cache token resettata')
}