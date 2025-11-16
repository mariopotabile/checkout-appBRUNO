"use client"

import React, { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import type { StripeElementsOptions } from "@stripe/stripe-js"

// ---------------------------------------------
// STRIPE
// ---------------------------------------------
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
)

// ---------------------------------------------
// TIPI
// ---------------------------------------------
type CheckoutItem = {
  id: number | string
  title: string
  variantTitle?: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
}

type Customer = {
  email: string
  firstName: string
  lastName: string
  address1: string
  address2?: string
  city: string
  province: string
  zip: string
  country: string
}

// ---------------------------------------------
// PAGINA INTERNA (CON useSearchParams)
// ---------------------------------------------
function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") ?? ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [currency, setCurrency] = useState("EUR")
  const [subtotalCents, setSubtotalCents] = useState(0)
  const [shippingCents, setShippingCents] = useState(0)
  const [totalCents, setTotalCents] = useState(0)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const [customer, setCustomer] = useState<Customer>({
    email: "",
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  // ---------------------------------------------
  // CARICA CARRELLO DA /api/cart-session
  // ---------------------------------------------
  useEffect(() => {
    async function loadCart() {
      if (!sessionId) {
        setError("Nessuna sessione di checkout trovata.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const itemsData: CheckoutItem[] = Array.isArray(data.items)
          ? data.items.map((it: any) => ({
              id: it.id,
              title: it.title,
              variantTitle: it.variantTitle || "",
              quantity: Number(it.quantity || 0),
              priceCents: Number(it.priceCents || 0),
              linePriceCents: Number(it.linePriceCents || 0),
              image: it.image,
            }))
          : []

        const currency = (data.currency || "EUR").toString().toUpperCase()
        const subCents = Number(data.subtotalCents || data.totals?.subtotal || 0)
        const shipCents = Number(data.shippingCents || 0)
        const totCents =
          data.totalCents != null
            ? Number(data.totalCents)
            : subCents + shipCents

        setItems(itemsData)
        setCurrency(currency)
        setSubtotalCents(subCents)
        setShippingCents(shipCents)
        setTotalCents(totCents)
        setError(null)
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    }

    loadCart()
  }, [sessionId])

  // ---------------------------------------------
  // CREA PAYMENT INTENT SU /api/payment-intent
  // ---------------------------------------------
  useEffect(() => {
    async function createIntent() {
      if (!sessionId) return
      if (!totalCents) return

      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            customer,
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          console.error("[payment-intent] errore:", data)
          setError(data.error || "Errore nel preparare il pagamento")
          return
        }

        setClientSecret(data.clientSecret)
      } catch (err) {
        console.error(err)
        setError("Errore nel preparare il pagamento")
      }
    }

    // lo richiamiamo quando cambia totalCents o sessionId
    if (totalCents > 0) {
      createIntent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, totalCents])

  // ---------------------------------------------
  // HANDLER CAMBIO DATI CUSTOMER
  // ---------------------------------------------
  function handleCustomerChange<K extends keyof Customer>(
    field: K,
    value: Customer[K],
  ) {
    setCustomer(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // ---------------------------------------------
  // UI BASE
  // ---------------------------------------------
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black">
        <p>Caricamento checkout…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black px-4">
        <div className="border border-red-300 bg-red-50 rounded-xl px-4 py-3 max-w-md w-full text-center">
          <h1 className="text-base font-semibold mb-1">Errore checkout</h1>
          <p className="text-sm mb-4">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-black text-white px-4 py-2 text-sm"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  const subtotal = subtotalCents / 100
  const shipping = shippingCents / 100
  const total = totalCents / 100
  const totalFormatted = `${total.toFixed(2)} ${currency}`

  const itemsCount = items.reduce(
    (acc, it) => acc + Number(it.quantity || 0),
    0,
  )

  return (
    <main className="min-h-screen bg-white text-black flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
        {/* COLONNA SINISTRA: DATI CLIENTE / SPEDIZIONE */}
        <section className="space-y-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">
              Checkout
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Completa i tuoi dati per finalizzare l&apos;ordine.
            </p>
          </header>

          {/* EMAIL */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-gray-900">
              Informazioni di contatto
            </h2>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600">
                Email
              </label>
              <input
                type="email"
                value={customer.email}
                onChange={e => handleCustomerChange("email", e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                placeholder="nome@email.com"
              />
            </div>
          </div>

          {/* INDIRIZZO */}
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-900">
              Indirizzo di spedizione
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  Nome
                </label>
                <input
                  value={customer.firstName}
                  onChange={e =>
                    handleCustomerChange("firstName", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  Cognome
                </label>
                <input
                  value={customer.lastName}
                  onChange={e =>
                    handleCustomerChange("lastName", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">
                Indirizzo
              </label>
              <input
                value={customer.address1}
                onChange={e =>
                  handleCustomerChange("address1", e.target.value)
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">
                Dettagli aggiuntivi (opzionale)
              </label>
              <input
                value={customer.address2}
                onChange={e =>
                  handleCustomerChange("address2", e.target.value)
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                placeholder="Interno, scala, citofono…"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  CAP
                </label>
                <input
                  value={customer.zip}
                  onChange={e => handleCustomerChange("zip", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  Città
                </label>
                <input
                  value={customer.city}
                  onChange={e => handleCustomerChange("city", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  Provincia
                </label>
                <input
                  value={customer.province}
                  onChange={e =>
                    handleCustomerChange("province", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">
                Paese/Regione
              </label>
              <input
                value={customer.country}
                onChange={e =>
                  handleCustomerChange("country", e.target.value)
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </div>

            {/* Info spedizione fissa 5,90€ */}
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Spedizione standard: <strong>5,90 €</strong> in tutta Italia.
              Il costo è già incluso nel totale ordine.
            </div>
          </div>
        </section>

        {/* COLONNA DESTRA: RIEPILOGO + PAGAMENTO */}
        <section className="space-y-6">
          {/* RIEPILOGO ORDINE */}
          <div className="border border-gray-200 rounded-2xl p-5 bg-white">
            <h2 className="text-sm font-medium text-gray-900 mb-4">
              Riepilogo ordine ({itemsCount})
            </h2>

            <div className="space-y-3 max-h-72 overflow-auto pr-1">
              {items.map((item, idx) => {
                const unitPrice = item.priceCents / 100
                const linePrice = item.linePriceCents / 100

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      {item.image && (
                        <div className="relative h-12 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-medium text-gray-900">
                          {item.title}
                        </div>
                        {item.variantTitle && (
                          <div className="text-[11px] text-gray-500">
                            {item.variantTitle}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {item.quantity} × {unitPrice.toFixed(2)} {currency}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-gray-900">
                      {linePrice.toFixed(2)} {currency}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotale</span>
                <span>
                  {subtotal.toFixed(2)} {currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Spedizione</span>
                <span>
                  {shipping.toFixed(2)} {currency}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between text-base">
                <span className="font-semibold text-gray-900">Totale</span>
                <span className="font-semibold">
                  {total.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          </div>

          {/* BOX PAGAMENTO STRIPE */}
          <div className="border border-gray-200 rounded-2xl p-5 bg-white">
            <h2 className="text-sm font-medium text-gray-900 mb-3">
              Pagamento con carta
            </h2>
            <PaymentBox
              clientSecret={clientSecret}
              sessionId={sessionId}
              customer={customer}
              totalFormatted={totalFormatted}
            />
          </div>
        </section>
      </div>
    </main>
  )
}

/* ---------------------------------------------
   BOX PAGAMENTO STRIPE
---------------------------------------------- */

function PaymentBox({
  clientSecret,
  sessionId,
  customer,
  totalFormatted,
}: {
  clientSecret: string | null
  sessionId: string
  customer: Customer
  totalFormatted: string
}) {
  if (!clientSecret) {
    return (
      <div className="text-sm text-gray-500">
        Preparazione del pagamento in corso…
      </div>
    )
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: "flat",
      labels: "floating",
      variables: {
        colorPrimary: "#000000",
        colorBackground: "#ffffff",
        colorText: "#111111",
        colorDanger: "#df1c41",
        borderRadius: "8px",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      },
      rules: {
        ".Input, .Block": {
          backgroundColor: "rgba(255,255,255,1)",
          border: "1.5px solid #111111",
          boxShadow: "0 0 0 0 rgba(0,0,0,0)",
          padding: "10px 12px",
        },
        ".Input--focus, .Block--focus": {
          border: "1.5px solid #000000",
          boxShadow: "0 0 0 1px #000000",
        },
        ".Input--invalid, .Block--invalid": {
          borderColor: "#df1c41",
          boxShadow: "0 0 0 1px rgba(223,28,65,0.3)",
        },
        ".Label": {
          fontSize: "13px",
          fontWeight: "500",
          color: "#111111",
        },
      },
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentBoxInner
        sessionId={sessionId}
        customer={customer}
        totalFormatted={totalFormatted}
      />
    </Elements>
  )
}

function PaymentBoxInner({
  sessionId,
  customer,
  totalFormatted,
}: {
  sessionId: string
  customer: Customer
  totalFormatted: string
}) {
  const stripe = useStripe()
  const elements = useElements()

  const defaultName = `${customer.firstName ?? ""} ${
    customer.lastName ?? ""
  }`.trim()

  const [cardholderName, setCardholderName] = useState(defaultName)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (!stripe || !elements) return

    setPaying(true)
    setError(null)

    const fullName = cardholderName.trim() || defaultName || ""

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: fullName || undefined,
              email: customer.email || undefined,
              address: {
                line1: customer.address1 || undefined,
                line2: customer.address2 || undefined,
                postal_code: customer.zip || undefined,
                city: customer.city || undefined,
                state: customer.province || undefined,
                country: customer.country || undefined,
              },
            },
          },
        },
        redirect: "if_required",
      } as any)

      if (error) {
        console.error(error)
        setError(error.message || "Errore durante il pagamento")
        setPaying(false)
        return
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        try {
          await fetch("/api/shopify/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              paymentIntentId: paymentIntent.id,
              customer,
            }),
          })
        } catch (e) {
          console.error("Errore creazione ordine Shopify", e)
        }

        window.location.href = `/thank-you?sessionId=${encodeURIComponent(
          sessionId,
        )}&pi=${encodeURIComponent(paymentIntent.id)}`
      } else {
        setError("Pagamento non completato. Riprova.")
        setPaying(false)
      }
    } catch (err: any) {
      console.error(err)
      setError(
        err?.message || "Errore imprevisto durante il pagamento",
      )
      setPaying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Nome intestatario prima del box carta */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-black focus:ring-2 focus:ring-black"
          placeholder="Es. Mario Rossi"
        />
      </div>

      {/* Box carta con bordi neri ben visibili */}
      <div className="rounded-2xl border border-black/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] px-4 py-5">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={paying || !stripe || !elements}
        className="w-full inline-flex items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
      >
        {paying ? "Elaborazione…" : `Paga ora ${totalFormatted}`}
      </button>
      <p className="text-[11px] text-gray-500">
        I pagamenti sono elaborati in modo sicuro da Stripe. I dati
        della carta non passano mai sui nostri server.
      </p>
    </div>
  )
}

// ---------------------------------------------
// EXPORT DI DEFAULT RICHIESTO DA NEXT
// ---------------------------------------------
export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}