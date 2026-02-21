// src/app/thank-you/page.tsx
"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"

type OrderData = {
  shopifyOrderNumber?: string
  shopifyOrderId?: string
  email?: string
  subtotalCents?: number
  shippingCents?: number
  discountCents?: number
  totalCents?: number
  currency?: string
  shopDomain?: string
  paymentIntentId?: string
  rawCart?: {
    id?: string
    token?: string
    attributes?: Record<string, any>
  }
  items?: Array<{
    id?: string
    variant_id?: string
    title: string
    quantity: number
    image?: string
    variantTitle?: string
    priceCents?: number
    linePriceCents?: number
  }>
  customer?: {
    email?: string
    phone?: string
    fullName?: string
    city?: string
    postalCode?: string
    countryCode?: string
  }
}

function ThankYouContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [orderData, setOrderData] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cartCleared, setCartCleared] = useState(false)

  const [upsellLoading, setUpsellLoading] = useState(false)
  const [upsellSuccess, setUpsellSuccess] = useState(false)
  const [upsellError, setUpsellError] = useState<string | null>(null)

  useEffect(() => {
    async function loadOrderDataAndClearCart() {
      if (!sessionId) {
        setError("Sessione non valida")
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Errore nel caricamento dell'ordine")
        }

        console.log("[ThankYou] 📦 Dati carrello ricevuti:", data)
        console.log("[ThankYou] 📦 RawCart attributes:", data.rawCart?.attributes)

        const subtotal = data.subtotalCents || 0
        const total = data.totalCents || 0
        const shipping = 0
        const discount = subtotal > 0 && total > 0 ? subtotal - total : 0

        console.log("[ThankYou] 💰 Calcoli:")
        console.log("  - Subtotale:", subtotal / 100, "€")
        console.log("  - Sconto:", discount / 100, "€")
        console.log("  - Spedizione:", shipping / 100, "€ (GRATIS)")
        console.log("  - TOTALE:", total / 100, "€")

        const processedOrderData: OrderData = {
          shopifyOrderNumber: data.shopifyOrderNumber,
          shopifyOrderId: data.shopifyOrderId,
          email: data.customer?.email,
          subtotalCents: subtotal,
          shippingCents: shipping,
          discountCents: discount > 0 ? discount : 0,
          totalCents: total,
          currency: data.currency || "EUR",
          shopDomain: data.shopDomain,
          paymentIntentId: data.paymentIntentId,
          rawCart: data.rawCart,
          items: data.items || [],
          customer: data.customer,
        }

        setOrderData(processedOrderData)

        // PIXEL FACEBOOK PAGEVIEW
        if (typeof window !== "undefined") {
          console.log("[ThankYou] 📊 Facebook Pixel PageView")

          if ((window as any).fbq) {
            try {
              ;(window as any).fbq("track", "PageView")
              console.log("[ThankYou] ✅ Facebook Pixel PageView inviato")
            } catch (err) {
              console.error("[ThankYou] ⚠️ Facebook Pixel bloccato:", err)
            }
          } else {
            console.log("[ThankYou] ⚠️ Facebook Pixel non disponibile (fbq non trovato)")
          }
        }

        // GOOGLE ADS CONVERSION
        const sendGoogleConversion = () => {
          if (typeof window !== "undefined" && (window as any).gtag) {
            console.log("[ThankYou] 📊 Invio Google Ads Purchase...")

            const orderTotal = total / 100
            const orderId =
              data.shopifyOrderNumber || data.shopifyOrderId || sessionId

            const cartAttrs = data.rawCart?.attributes || {}

            ;(window as any).gtag("event", "conversion", {
              send_to: "AW-17391033186/G-u0CLKyxbsbEOK22ORA",
              value: orderTotal,
              currency: data.currency || "EUR",
              transaction_id: orderId,
              utm_source: cartAttrs._wt_last_source || "",
              utm_medium: cartAttrs._wt_last_medium || "",
              utm_campaign: cartAttrs._wt_last_campaign || "",
              utm_content: cartAttrs._wt_last_content || "",
              utm_term: cartAttrs._wt_last_term || "",
            })

            console.log("[ThankYou] ✅ Google Ads Purchase inviato con UTM")
            console.log("[ThankYou] ID Ordine:", orderId)
            console.log("[ThankYou] Valore:", orderTotal, data.currency || "EUR")
            console.log("[ThankYou] UTM Campaign:", cartAttrs._wt_last_campaign || "direct")
          }
        }

        if ((window as any).gtag) {
          sendGoogleConversion()
        } else {
          const checkGtag = setInterval(() => {
            if ((window as any).gtag) {
              clearInterval(checkGtag)
              sendGoogleConversion()
            }
          }, 100)
          setTimeout(() => clearInterval(checkGtag), 5000)
        }

        // ANALYTICS
        const saveAnalytics = async () => {
          try {
            console.log("[ThankYou] 💾 Salvataggio analytics su Firebase...")

            const cartAttrs = data.rawCart?.attributes || {}

            const analyticsData = {
              orderId: processedOrderData.shopifyOrderId || sessionId,
              orderNumber: processedOrderData.shopifyOrderNumber || null,
              sessionId: sessionId,
              timestamp: new Date().toISOString(),
              value: total / 100,
              valueCents: total,
              subtotalCents: subtotal,
              shippingCents: shipping,
              discountCents: discount,
              currency: data.currency || "EUR",
              itemCount: (data.items || []).length,
              utm: {
                source: cartAttrs._wt_last_source || null,
                medium: cartAttrs._wt_last_medium || null,
                campaign: cartAttrs._wt_last_campaign || null,
                content: cartAttrs._wt_last_content || null,
                term: cartAttrs._wt_last_term || null,
                fbclid: cartAttrs._wt_last_fbclid || null,
                gclid: cartAttrs._wt_last_gclid || null,
                campaign_id: cartAttrs._wt_last_campaign_id || null,
                adset_id: cartAttrs._wt_last_adset_id || null,
                adset_name: cartAttrs._wt_last_adset_name || null,
                ad_id: cartAttrs._wt_last_ad_id || null,
                ad_name: cartAttrs._wt_last_ad_name || null,
              },
              utm_first: {
                source: cartAttrs._wt_first_source || null,
                medium: cartAttrs._wt_first_medium || null,
                campaign: cartAttrs._wt_first_campaign || null,
                content: cartAttrs._wt_first_content || null,
                term: cartAttrs._wt_first_term || null,
                referrer: cartAttrs._wt_first_referrer || null,
                landing: cartAttrs._wt_first_landing || null,
                fbclid: cartAttrs._wt_first_fbclid || null,
                gclid: cartAttrs._wt_first_gclid || null,
                campaign_id: cartAttrs._wt_first_campaign_id || null,
                adset_id: cartAttrs._wt_first_adset_id || null,
                adset_name: cartAttrs._wt_first_adset_name || null,
                ad_id: cartAttrs._wt_first_ad_id || null,
                ad_name: cartAttrs._wt_first_ad_name || null,
              },
              customer: {
                email: processedOrderData.email || null,
                fullName: data.customer?.fullName || null,
                city: data.customer?.city || null,
                postalCode: data.customer?.postalCode || null,
                countryCode: data.customer?.countryCode || null,
              },
              items: (data.items || []).map((item: any) => ({
                id: item.id || item.variant_id,
                title: item.title,
                quantity: item.quantity,
                priceCents: item.priceCents || 0,
                linePriceCents: item.linePriceCents || 0,
                image: item.image || null,
                variantTitle: item.variantTitle || null,
              })),
              shopDomain: data.shopDomain || "oltreboutique.com",
            }

            const analyticsRes = await fetch("/api/analytics/purchase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(analyticsData),
            })

            if (analyticsRes.ok) {
              const result = await analyticsRes.json()
              console.log("[ThankYou] ✅ Analytics salvate su Firebase - ID:", result.id)
            } else {
              const errorData = await analyticsRes.json()
              console.error("[ThankYou] ⚠️ Errore salvataggio analytics:", errorData)
            }
          } catch (err) {
            console.error("[ThankYou] ⚠️ Errore chiamata analytics:", err)
          }
        }

        saveAnalytics()

        // SVUOTA CARRELLO
        if (data.rawCart?.id || data.rawCart?.token) {
          const cartId =
            data.rawCart.id ||
            `gid://shopify/Cart/${data.rawCart.token}`
          console.log("[ThankYou] 🧹 Avvio svuotamento carrello")

          try {
            const clearRes = await fetch("/api/clear-cart", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cartId: cartId,
                sessionId: sessionId,
              }),
            })

            const clearData = await clearRes.json()

            if (clearRes.ok) {
              console.log("[ThankYou] ✅ Carrello svuotato con successo")
              setCartCleared(true)
            } else {
              console.error("[ThankYou] ⚠️ Errore svuotamento carrello:", clearData.error)
            }
          } catch (clearErr) {
            console.error("[ThankYou] ⚠️ Errore chiamata clear-cart:", clearErr)
          }
        } else {
          console.log("[ThankYou] ℹ️ Nessun carrello da svuotare")
        }

        setLoading(false)
      } catch (err: any) {
        console.error("[ThankYou] Errore caricamento ordine:", err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadOrderDataAndClearCart()
  }, [sessionId])

  const shopUrl = "https://oltreboutique.com"

  const formatMoney = (cents: number | undefined) => {
    const value = (cents ?? 0) / 100
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: orderData?.currency || "EUR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  // 👇 CONFIG PRODOTTO UPSELL
  const UPSELL_CONFIG = {
    variantId: 55350819750273,
    quantity: 1,
    priceCents: 100,
    title: "Aggiungi 1 pezzo in più a un prezzo speciale!",
    subtitle: "Solo ora, subito dopo la conferma del tuo ordine.",
    bullet1: "Nessun costo di spedizione aggiuntivo, stesso pacco.",
    bullet2: "Perfetto come regalo o per averne sempre uno di scorta.",
  }

  const handleUpsell = async () => {
    if (!sessionId || !orderData) return
    setUpsellError(null)
    setUpsellSuccess(false)
    setUpsellLoading(true)

    try {
      const res = await fetch("/api/upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          variantId: UPSELL_CONFIG.variantId,
          quantity: UPSELL_CONFIG.quantity,
          upsellAmountCents: UPSELL_CONFIG.priceCents,
        }),
      })

      const data = await res.json()
      console.log("[ThankYou] RISPOSTA UPSELL:", data)

      if (!res.ok || !data.success) {
        if (data.requiresAction) {
          setUpsellError(
            "La tua banca richiede un'autenticazione aggiuntiva per questo prodotto extra."
          )
        } else {
          setUpsellError(
            data.error || "Impossibile aggiungere il prodotto extra. Riprova."
          )
        }
        setUpsellLoading(false)
        return
      }

      setUpsellSuccess(true)
      setUpsellLoading(false)
    } catch (err: any) {
      console.error("[ThankYou] Errore upsell:", err)
      setUpsellError("Errore imprevisto durante l'aggiunta del prodotto extra.")
      setUpsellLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mb-4"></div>
          <p className="text-sm text-gray-600">Caricamento ordine...</p>
        </div>
      </div>
    )
  }

  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6 p-8 bg-white rounded-lg shadow-sm border border-gray-200">
          <svg
            className="w-16 h-16 text-red-500 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Ordine non trovato</h1>
          <p className="text-gray-600">{error}</p>
          <a
            href={shopUrl}
            className="inline-block mt-4 px-6 py-3 bg-gray-900 text-white font-medium rounded-md hover:bg-gray-800 transition"
          >
            Torna alla home
          </a>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* FACEBOOK PIXEL INIT */}
      <Script id="facebook-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          
          fbq('init', '${process.env.NEXT_PUBLIC_FB_PIXEL_ID}');
          console.log('[ThankYou] ✅ Facebook Pixel inizializzato');
        `}
      </Script>

      {/* GOOGLE TAG */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=AW-17391033186"
        strategy="afterInteractive"
      />
      <Script
        id="google-ads-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17391033186');
            console.log('[ThankYou] ✅ Google Tag inizializzato');
          `,
        }}
      />

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
          background: #fafafa;
          color: #333333;
          -webkit-font-smoothing: antialiased;
        }
      `}</style>

      <div className="min-h-screen bg-[#fafafa]">
        {/* HEADER */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-center">
              <a href={shopUrl}>
                {/* ← LOGO NIMEA aggiornato */}
                <img
                  src="https://cdn.shopify.com/s/files/1/0927/1902/2465/files/LOGO_NIMEA.png?v=1771617668"
                  alt="Nimea"
                  className="h-12"
                  style={{ maxWidth: "180px" }}
                />
              </a>
            </div>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
          {/* ORDER CARD */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 mb-6">
            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-6">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 text-center mb-2">
              Ordine confermato
            </h1>
            <p className="text-center text-gray-600 mb-6">
              Grazie per il tuo acquisto!
            </p>

            {orderData.shopifyOrderNumber && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-gray-600 mb-1">Numero ordine</p>
                <p className="text-2xl font-bold text-gray-900">
                  #{orderData.shopifyOrderNumber}
                </p>
              </div>
            )}

            {orderData.email && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">
                      Conferma inviata a
                    </p>
                    <p className="text-sm text-gray-600">
                      {orderData.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {orderData.items && orderData.items.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">
                  Articoli acquistati
                </h2>
                <div className="space-y-4">
                  {orderData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      {item.image && (
                        <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded border border-gray-200">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover rounded"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {item.title}
                        </p>
                        {item.variantTitle && (
                          <p className="text-xs text-gray-500 mt-1">
                            {item.variantTitle}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Quantità: {item.quantity}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">
                          {formatMoney(item.linePriceCents || item.priceCents || 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotale</span>
                  <span className="text-gray-900">
                    {formatMoney(orderData.subtotalCents)}
                  </span>
                </div>

                {orderData.discountCents && orderData.discountCents > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Sconto</span>
                    <span>-{formatMoney(orderData.discountCents)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Spedizione</span>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-bold">GRATIS</span>
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>

                <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200">
                  <span>Totale</span>
                  <span className="text-xl">
                    {formatMoney(orderData.totalCents)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 🔥 BLOCCO UPSELL */}
          {!upsellSuccess && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 sm:p-8 mb-8 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold bg-red-600 text-white rounded-full uppercase tracking-wide">
                  Ultima occasione
                </span>
                <span className="text-xs text-red-700 font-semibold">
                  Valido solo su questa pagina
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Vuoi aggiungere 1 pezzo in più a un prezzo speciale?
              </h2>
              <p className="text-sm text-gray-700 mb-4">
                Il tuo ordine è confermato. Solo ora puoi aggiungere un prodotto
                extra alla tua spedizione senza reinserire i dati della carta.
              </p>

              <div className="bg-white border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {UPSELL_CONFIG.title}
                </p>
                <p className="text-xs text-gray-600 mb-3">
                  {UPSELL_CONFIG.subtitle}
                </p>
                <ul className="text-xs text-gray-700 mb-3 space-y-1">
                  <li>• {UPSELL_CONFIG.bullet1}</li>
                  <li>• {UPSELL_CONFIG.bullet2}</li>
                  <li>• Aggiunto allo stesso nome e indirizzo di spedizione</li>
                </ul>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Prezzo speciale ora:</span>
                  <span className="text-lg font-bold text-red-600">
                    {formatMoney(UPSELL_CONFIG.priceCents)}
                  </span>
                </div>
              </div>

              {upsellError && (
                <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {upsellError}
                </div>
              )}

              <button
                onClick={handleUpsell}
                disabled={upsellLoading}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed mb-2"
              >
                {upsellLoading
                  ? "Aggiunta del prodotto extra in corso..."
                  : "Sì, aggiungi questo prodotto extra al mio ordine"}
              </button>
              <p className="text-[11px] text-gray-500 text-center">
                Cliccando autorizzi un addebito extra una tantum di{" "}
                {formatMoney(UPSELL_CONFIG.priceCents)} con lo stesso metodo di pagamento.
              </p>
            </div>
          )}

          {upsellSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
              <p className="text-sm text-green-800 text-center">
                ✓ Prodotto extra aggiunto con successo. Riceverai una conferma
                d'ordine separata per l'upsell.
              </p>
            </div>
          )}

          {/* INFO BOX */}
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Cosa succede adesso?
            </h2>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">1.</span>
                <span>Riceverai un'email di conferma con tutti i dettagli</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">2.</span>
                <span>Il tuo ordine verrà preparato entro 1-2 giorni lavorativi</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-semibold">3.</span>
                <span>Riceverai il tracking della spedizione via email</span>
              </li>
            </ul>
          </div>

          {/* PULSANTI */}
          <div className="space-y-3">
            <a
              href={shopUrl}
              className="block w-full py-3 px-4 bg-gray-900 text-white text-center font-medium rounded-md hover:bg-gray-800 transition"
            >
              Torna alla home
            </a>
            <a
              href={`${shopUrl}/collections/all`}
              className="block w-full py-3 px-4 bg-white text-gray-900 text-center font-medium rounded-md border border-gray-300 hover:bg-gray-50 transition"
            >
              Continua lo shopping
            </a>
          </div>

          {/* SUPPORTO */}
          <div className="text-center mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Hai bisogno di aiuto?</p>
            <a
              href={`${shopUrl}/pages/contatti`}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Contatta il supporto →
            </a>
          </div>

          {/* CARRELLO SVUOTATO */}
          {cartCleared && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-xs text-green-800 text-center">
                ✓ Carrello svuotato con successo
              </p>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="border-t border-gray-200 py-6 mt-12">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-xs text-gray-500">
              © 2026 Tutti i diritti riservati.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  )
}

