"use client"

import React, { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
)

type Customer = {
  fullName: string
  email: string
  address1: string
  address2: string
  city: string
  province: string
  zip: string
  country: string
}

// ---------------------------------------------
// COMPONENTE PRINCIPALE (inner con Suspense)
// ---------------------------------------------

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<any[]>([])
  const [currency, setCurrency] = useState("EUR")

  const [subtotal, setSubtotal] = useState(0) // € dopo sconto
  const [originalSubtotal, setOriginalSubtotal] = useState(0) // € pieno
  const [discountAmount, setDiscountAmount] = useState(0) // €
  const [discountCode, setDiscountCode] = useState<string | null>(null)

  const [shippingAmount, setShippingAmount] = useState(0) // €
  const [total, setTotal] = useState(0) // €

  const [shippingConfirmed, setShippingConfirmed] = useState(false)
  const [shippingMethodName, setShippingMethodName] =
    useState<string | null>(null)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  // dati indirizzo
  const [address, setAddress] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country: "IT",
  })

  function handleAddressChange(
    field: keyof typeof address,
    value: string,
  ) {
    setAddress(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  function isAddressComplete(addr: typeof address) {
    return (
      addr.firstName.trim() &&
      addr.lastName.trim() &&
      addr.email.trim() &&
      addr.address1.trim() &&
      addr.city.trim() &&
      addr.zip.trim() &&
      addr.country.trim()
    )
  }

  // -----------------------------------------
  // CARICA CARRELLO DA /api/cart-session
  // -----------------------------------------
  useEffect(() => {
    async function load() {
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

        const items = data.items || []
        const currency = data.currency || "EUR"

        // subtotalCents = totale effettivo dopo sconti
        const subtotalCents =
          Number(data.subtotalCents) ||
          Number(data.totals?.subtotal) ||
          0

        // subtotale pieno = somma(priceCents * qty)
        const originalSubtotalCents = items.reduce(
          (sum: number, it: any) =>
            sum +
            Number(it.priceCents || 0) *
              Number(it.quantity || 1),
          0,
        )

        const discountCents = Math.max(
          originalSubtotalCents - subtotalCents,
          0,
        )

        // recupero codice sconto da rawCart se presente
        let code: string | null = null
        const rawCart = data.rawCart || {}
        if (
          Array.isArray(rawCart.discount_codes) &&
          rawCart.discount_codes.length > 0
        ) {
          const dc = rawCart.discount_codes[0]
          code = dc.title || dc.code || null
        } else if (
          Array.isArray(
            rawCart.cart_level_discount_applications,
          ) &&
          rawCart.cart_level_discount_applications.length > 0
        ) {
          const dc = rawCart.cart_level_discount_applications[0]
          code = dc.title || null
        }

        setItems(items)
        setCurrency(currency)

        const sub = subtotalCents / 100
        const originalSub = originalSubtotalCents / 100
        const discount = discountCents / 100

        setSubtotal(sub)
        setOriginalSubtotal(originalSub)
        setDiscountAmount(discount)
        setDiscountCode(code)

        // inizialmente nessuna spedizione applicata
        setShippingAmount(0)
        setTotal(sub)
        setShippingConfirmed(false)
        setShippingMethodName(null)

        setError(null)
      } catch (err) {
        console.error(err)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  // -----------------------------------------
  // Applica automaticamente 5,90€ quando l’indirizzo è completo
  // -----------------------------------------
  useEffect(() => {
    const complete = isAddressComplete(address)

    if (complete && !shippingConfirmed) {
      const shipping = 5.9
      setShippingAmount(shipping)
      setShippingMethodName("Spedizione Standard 24/48h")
      setTotal(subtotal + shipping)
      setShippingConfirmed(true)
      setError(null)
    }

    if (!complete && shippingConfirmed) {
      // se l’utente cancella qualcosa, togliamo la spedizione
      setShippingAmount(0)
      setShippingMethodName(null)
      setTotal(subtotal)
      setShippingConfirmed(false)
    }
  }, [address, subtotal, shippingConfirmed])

  // -----------------------------------------
  // CREA PAYMENT INTENT / OTTIENI clientSecret
  // -----------------------------------------
  useEffect(() => {
    async function createPaymentIntent() {
      if (!sessionId) return
      if (!subtotal) return // niente carrello

      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })

        const data = await res.json()
        if (!res.ok) {
          console.error("Errore payment-intent:", data)
          setError(
            data.error ||
              "Errore nella preparazione del pagamento.",
          )
          return
        }

        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
        } else {
          setError(
            "Risposta pagamento non valida: nessun clientSecret.",
          )
        }
      } catch (err) {
        console.error(err)
        setError("Errore nella comunicazione con il server di pagamento.")
      }
    }

    createPaymentIntent()
  }, [sessionId, subtotal])

  const itemsCount = items.reduce(
    (acc, it) => acc + Number(it.quantity || 0),
    0,
  )

  const customer: Customer = {
    fullName: `${address.firstName} ${address.lastName}`.trim(),
    email: address.email,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    zip: address.zip,
    country: address.country || "IT",
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black">
        Caricamento checkout…
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black">
        <div className="bg-red-50 border border-red-300 rounded-2xl px-6 py-4 max-w-md text-center">
          <h1 className="text-lg font-semibold mb-2">
            Errore checkout
          </h1>
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <a
            href="/"
            className="px-4 py-2 rounded-full bg-black text-white text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  const totalFormatted = `${total.toFixed(2)} ${currency}`

  return (
    <main className="min-h-screen bg-white text-black flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-8">
        {/* LOGO CENTRALE */}
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            alt="Checkify"
            className="h-14 w-auto"
          />
        </div>

        <div className="grid gap-8 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1.2fr)]">
          {/* COLONNA SINISTRA */}
          <section className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm">
            <header className="mb-6">
              <h1 className="text-2xl font-semibold">Checkout</h1>
              <p className="text-sm text-gray-600 mt-1">
                Completa i dati di spedizione e paga in modo sicuro.
              </p>
            </header>

            {/* DATI SPEDIZIONE */}
            <div className="space-y-4 mb-8">
              <h2 className="text-sm font-semibold uppercase text-gray-800">
                Dati di spedizione
              </h2>

              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Nome"
                  value={address.firstName}
                  onChange={e =>
                    handleAddressChange("firstName", e.target.value)
                  }
                />
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Cognome"
                  value={address.lastName}
                  onChange={e =>
                    handleAddressChange("lastName", e.target.value)
                  }
                />
              </div>

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Email"
                type="email"
                value={address.email}
                onChange={e =>
                  handleAddressChange("email", e.target.value)
                }
              />

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Telefono (opzionale)"
                value={address.phone}
                onChange={e =>
                  handleAddressChange("phone", e.target.value)
                }
              />

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Indirizzo"
                value={address.address1}
                onChange={e =>
                  handleAddressChange("address1", e.target.value)
                }
              />

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Interno, scala, citofono (opzionale)"
                value={address.address2}
                onChange={e =>
                  handleAddressChange("address2", e.target.value)
                }
              />

              <div className="grid gap-3 md:grid-cols-3">
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="CAP"
                  value={address.zip}
                  onChange={e =>
                    handleAddressChange("zip", e.target.value)
                  }
                />
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Città"
                  value={address.city}
                  onChange={e =>
                    handleAddressChange("city", e.target.value)
                  }
                />
                <input
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Provincia"
                  value={address.province}
                  onChange={e =>
                    handleAddressChange("province", e.target.value)
                  }
                />
              </div>

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Paese"
                value={address.country}
                onChange={e =>
                  handleAddressChange("country", e.target.value)
                }
              />

              <p className="text-[11px] text-gray-500 mt-1">
                La spedizione verrà aggiunta automaticamente dopo aver
                inserito tutti i dati obbligatori.
              </p>
            </div>

            {/* ARTICOLI */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase text-gray-800">
                  Articoli nel carrello
                </h2>
                <span className="text-xs text-gray-500">
                  ({itemsCount})
                </span>
              </div>

              {discountCode && discountAmount > 0 && (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs mb-1 border border-emerald-200">
                  <span className="font-semibold">
                    Codice sconto: {discountCode}
                  </span>
                  <span>
                    −{discountAmount.toFixed(2)} {currency} sul totale
                  </span>
                </div>
              )}

              {items.map((item, idx) => {
                const qty = Number(item.quantity || 1)
                const rawLineCents =
                  item.linePriceCents ??
                  item.line_price ??
                  item.linePrice ??
                  0
                const rawPriceCents =
                  item.priceCents ?? item.price ?? 0

                const unitPrice = rawPriceCents / 100
                const linePrice = rawLineCents / 100
                const effectiveUnit =
                  qty > 0 ? linePrice / qty : unitPrice

                const hasDiscount = effectiveUnit < unitPrice - 0.001
                const savingPerUnit = unitPrice - effectiveUnit
                const savingTotal = savingPerUnit * qty

                return (
                  <div
                    key={idx}
                    className="flex gap-3 p-3 bg-gray-50 border border-gray-200 rounded-2xl"
                  >
                    {item.image && (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 flex justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {item.title}
                        </div>
                        {item.variantTitle && (
                          <div className="text-xs text-gray-500">
                            {item.variantTitle}
                          </div>
                        )}
                        <div className="text-xs text-gray-600 mt-1">
                          {qty}×{" "}
                          {hasDiscount ? (
                            <>
                              <span className="line-through opacity-60 mr-1">
                                {unitPrice.toFixed(2)} {currency}
                              </span>
                              <span>
                                {effectiveUnit.toFixed(2)} {currency}
                              </span>
                            </>
                          ) : (
                            <>
                              {unitPrice.toFixed(2)} {currency}
                            </>
                          )}
                        </div>
                        {hasDiscount && savingTotal > 0 && (
                          <div className="text-[11px] text-emerald-600 mt-1">
                            Risparmi{" "}
                            {savingTotal.toFixed(2)} {currency}
                          </div>
                        )}
                      </div>

                      <div className="text-sm font-semibold text-gray-900">
                        {linePrice.toFixed(2)} {currency}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* COLONNA DESTRA – TOT + PAGAMENTO */}
          <section className="bg-white border border-gray-200 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
            <div>
              <h2 className="text-sm font-semibold uppercase text-gray-800 mb-4">
                Riepilogo ordine
              </h2>

              <div className="space-y-3 text-sm">
                {/* Subtotale pieno */}
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Subtotale prodotti
                  </span>
                  <span className="text-gray-900">
                    {originalSubtotal.toFixed(2)} {currency}
                  </span>
                </div>

                {/* Sconto */}
                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Sconto
                      {discountCode
                        ? ` (${discountCode})`
                        : ""}
                    </span>
                    <span className="text-red-600">
                      −{discountAmount.toFixed(2)} {currency}
                    </span>
                  </div>
                )}

                {/* Subtotale dopo sconto */}
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotale</span>
                  <span className="text-gray-900">
                    {subtotal.toFixed(2)} {currency}
                  </span>
                </div>

                {/* Spedizione */}
                <div className="flex justify-between">
                  <span className="text-gray-600">Spedizione</span>
                  {shippingConfirmed ? (
                    <span className="text-gray-900">
                      {shippingAmount.toFixed(2)} {currency}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      Inserisci l&apos;indirizzo per calcolare
                    </span>
                  )}
                </div>

                {shippingConfirmed && (
                  <div className="mt-1 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                    <div className="font-semibold text-gray-900">
                      {shippingMethodName}
                    </div>
                    <div className="text-gray-600">
                      Consegna stimata in 24/48h in tutta Italia.
                    </div>
                  </div>
                )}

                {/* Totale finale */}
                <div className="border-t border-gray-200 pt-3 flex justify-between text-base">
                  <span className="font-semibold text-gray-900">
                    Totale
                  </span>
                  <span className="font-semibold text-lg text-gray-900">
                    {(subtotal + shippingAmount).toFixed(2)}{" "}
                    {currency}
                  </span>
                </div>
              </div>
            </div>

            {/* BOX PAGAMENTO STRIPE */}
            <div className="mt-2">
              <h3 className="text-sm font-semibold mb-2">
                Pagamento con carta
              </h3>
              <PaymentBox
                clientSecret={clientSecret}
                sessionId={sessionId}
                customer={customer}
                totalFormatted={totalFormatted}
              />
            </div>
          </section>
        </div>
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

  const options: any = {
    clientSecret,
    appearance: {
      theme: "flat",
      labels: "floating",
      variables: {
        colorPrimary: "#000000",
        colorBackground: "#ffffff",
        colorText: "#000000",
        colorDanger: "#df1c41",
        borderRadius: "10px",
      },
      // Bordi scuri e niente effetto "ambrato" nel Payment Element
      rules: {
        ".Input": {
          backgroundColor: "#ffffff",
          borderColor: "#000000",
          boxShadow: "none",
          padding: "10px 12px",
        },
        ".Input:focus": {
          backgroundColor: "#ffffff",
          boxShadow: "0 0 0 1px #000000",
        },
        ".Fieldset": {
          borderColor: "#000000",
          boxShadow: "none",
        },
        ".Tab, .Block": {
          backgroundColor: "#f9fafb",
          borderColor: "#e5e7eb",
        },
        ".Label": {
          color: "#111111",
          fontSize: "12px",
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

  const [cardholderName, setCardholderName] = useState("")
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    if (!stripe || !elements) return

    setPaying(true)
    setError(null)

    const fullName =
      cardholderName.trim() || customer.fullName.trim() || ""

    try {
      const { error, paymentIntent } = (await stripe.confirmPayment({
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
      } as any)) as any

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
      {/* Nome intestatario sopra al box carta */}
      <div>
        <label className="block text-xs font-medium text-gray-800 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <input
          type="text"
          value={cardholderName}
          onChange={e => setCardholderName(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-black focus:ring-2 focus:ring-black"
          placeholder="Es. Mario Rossi"
        />
      </div>

      <div className="rounded-2xl border border-black bg-white shadow-[0_8px_24px_rgba(15,23,42,0.18)] px-4 py-5">
        <PaymentElement />
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

// wrapper con Suspense (Next)
export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}