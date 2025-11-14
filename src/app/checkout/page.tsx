// src/app/checkout/page.tsx
"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import PaymentBox from "./stripe/PaymentBox"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
)

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<any[]>([])
  const [currency, setCurrency] = useState("EUR")
  const [subtotal, setSubtotal] = useState(0)
  const [shippingAmount, setShippingAmount] = useState(0)
  const [total, setTotal] = useState(0)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Nessuna sessione di checkout trovata.")
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 1) Recuperiamo il carrello
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const items = data.items || []
        const currency = data.currency || "EUR"
        const subtotalCents = Number(data.subtotalCents || 0)
        const shippingCents = Number(data.shippingCents || 0)
        const totalCents =
          data.totalCents != null
            ? Number(data.totalCents)
            : subtotalCents + shippingCents

        setItems(items)
        setCurrency(currency)
        setSubtotal(subtotalCents / 100)
        setShippingAmount(shippingCents / 100)
        setTotal(totalCents / 100)

        // 2) Creiamo PaymentIntent
        const piRes = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        })
        const piData = await piRes.json()

        if (!piRes.ok || !piData.clientSecret) {
          console.error("[Checkout] errore PaymentIntent:", piData)
          setError(
            piData.error || "Errore nel creare il pagamento. Riprova tra poco.",
          )
          setLoading(false)
          return
        }

        setClientSecret(piData.clientSecret)
        setError(null)
      } catch (err) {
        console.error("[Checkout] errore:", err)
        setError("Errore nel caricamento del checkout.")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [sessionId])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        Caricamento checkout…
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        <div className="bg-red-900/40 border border-red-500/60 rounded-2xl px-6 py-4 max-w-md text-center">
          <h1 className="text-lg font-semibold mb-2">Errore checkout</h1>
          <p className="text-sm opacity-90 mb-4">{error}</p>
          <a
            href="/"
            className="px-4 py-2 rounded-full bg-slate-50 text-slate-900 text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )
  }

  const itemsCount = items.reduce(
    (acc, it) => acc + Number(it.quantity || 0),
    0,
  )

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* COLONNA SINISTRA: riepilogo */}
        <section className="bg-slate-900/70 border border-slate-700/60 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold">Checkout</h1>
            <p className="text-sm text-slate-300 mt-1">
              Rivedi il tuo ordine e inserisci i dati di pagamento.
            </p>
          </header>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase text-slate-200">
              Articoli nel carrello ({itemsCount})
            </h2>

            {items.map((item, idx) => {
              const linePrice = Number(item.linePriceCents || 0) / 100
              const unitPrice = Number(item.priceCents || 0) / 100

              return (
                <div
                  key={idx}
                  className="flex justify-between p-3 bg-slate-900/40 border border-slate-800 rounded-2xl"
                >
                  <div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-slate-400">
                      {item.variantTitle}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {item.quantity}× {unitPrice.toFixed(2)} {currency}
                    </div>
                  </div>

                  <div className="text-sm font-semibold">
                    {linePrice.toFixed(2)} {currency}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* COLONNA DESTRA: totali + pagamento */}
        <section className="bg-slate-900/80 border border-slate-700/70 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold uppercase text-slate-200 mb-4">
              Totale ordine
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-300">Subtotale</span>
                <span>
                  {subtotal.toFixed(2)} {currency}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-300">Spedizione</span>
                <span>
                  {shippingAmount > 0
                    ? `${shippingAmount.toFixed(2)} ${currency}`
                    : "Calcolata dopo"}
                </span>
              </div>

              <div className="border-t border-slate-700 pt-3 flex justify-between text-base">
                <span className="font-semibold text-slate-100">Totale</span>
                <span className="font-semibold text-lg">
                  {total.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          </div>

          {/* Stripe Payment Element */}
          {clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret }}
            >
              <PaymentBox sessionId={sessionId!} />
            </Elements>
          )}
        </section>
      </div>
    </main>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="text-slate-50">Caricamento…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}