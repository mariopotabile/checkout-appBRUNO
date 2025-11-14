"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import PaymentBox from "./stripe/PaymentBox"   // componente creato sotto

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
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

  const [clientSecret, setClientSecret] = useState("")

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError("Sessione non trovata.")
        setLoading(false)
        return
      }

      const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        setLoading(false)
        return
      }

      setItems(data.items || [])
      setCurrency(data.currency || "EUR")
      setSubtotal((data.subtotalCents ?? 0) / 100)
      setShippingAmount((data.shippingCents ?? 0) / 100)
      setTotal((data.totalCents ?? 0) / 100)
      setError(null)
      setLoading(false)
    }

    load()
  }, [sessionId])

  // 🔥 CREA PAYMENT INTENT APPENA ABBIAMO IL TOTALE
  useEffect(() => {
    if (!sessionId || total <= 0) return

    async function createIntent() {
      const res = await fetch("/api/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })

      const data = await res.json()
      setClientSecret(data.clientSecret)
    }

    createIntent()
  }, [sessionId, total])

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-white">Caricamento…</main>
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        <div>{error}</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center p-4">
      <h1 className="text-2xl font-semibold mb-4">Checkout</h1>

      {/* riepilogo ordine */}
      <div className="w-full max-w-xl mb-8 bg-slate-900 p-4 rounded-2xl border border-slate-700">
        <h2 className="text-sm font-semibold mb-3">Articoli</h2>
        {items.map((item, i) => (
          <div key={i} className="flex justify-between py-2 border-b border-slate-800">
            <div>
              {item.title}
              <div className="text-xs text-slate-400">{item.variantTitle}</div>
              <div className="text-xs text-slate-400">{item.quantity}× {(item.priceCents/100).toFixed(2)} {currency}</div>
            </div>
            <div>
              {(item.linePriceCents/100).toFixed(2)} {currency}
            </div>
          </div>
        ))}

        <div className="flex justify-between mt-4">
          <span>Subtotale</span>
          <span>{subtotal.toFixed(2)} {currency}</span>
        </div>

        <div className="flex justify-between mt-2">
          <span>Spedizione</span>
          <span>{shippingAmount > 0 ? shippingAmount.toFixed(2) : "—"} {currency}</span>
        </div>

        <div className="flex justify-between mt-4 text-lg font-semibold">
          <span>Totale</span>
          <span>{total.toFixed(2)} {currency}</span>
        </div>
      </div>

      {/* 🔥 PAGAMENTO INLINE STRIPE */}
      {clientSecret && (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentBox sessionId={sessionId!} />
        </Elements>
      )}
    </main>
  )
}

export default function CheckoutPageWrapper() {
  return (
    <Suspense fallback={<div className="text-white">Caricamento…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}