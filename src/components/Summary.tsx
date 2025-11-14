"use client"

import { useState } from "react"

interface SummaryProps {
  cart: any
}

export default function Summary({ cart }: SummaryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subtotal = cart?.subtotalPrice ?? 0
  const total = cart?.totalPrice ?? subtotal
  const currency = (cart?.currency || "EUR").toLowerCase()

  async function handlePay() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalAmount: total, // in centesimi
          currency,
          description: "Ordine Shopify via checkout custom",
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Errore nel pagamento")
      }

      if (!data.url) {
        throw new Error("Nessuna URL di checkout restituita da Stripe")
      }

      window.location.href = data.url
    } catch (err: any) {
      console.error("Summary / pagamento error:", err)
      setError(err.message || "Errore durante il pagamento")
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className="bg-white rounded-2xl shadow-md p-5 space-y-4">
      <h2 className="text-lg font-semibold">Riepilogo ordine</h2>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Subtotale</span>
          <span>{(subtotal / 100).toFixed(2)} €</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Spedizione</span>
          <span>Calcolata su Shopify</span>
        </div>
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>Totale</span>
          <span>{(total / 100).toFixed(2)} €</span>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
          {error}
        </div>
      )}

      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full bg-black text-white py-3 rounded-lg text-sm font-semibold hover:bg-gray-900 transition disabled:opacity-60"
      >
        {loading ? "Reindirizzamento a Stripe..." : "Paga con carta (Stripe)"}
      </button>

      <p className="text-[11px] text-gray-500 text-center">
        Il pagamento è elaborato in modo sicuro da Stripe.
      </p>
    </aside>
  )
}