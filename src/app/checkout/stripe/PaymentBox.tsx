"use client"

import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js"
import { useState } from "react"

export default function PaymentBox({ sessionId }: { sessionId: string }) {
  const stripe = useStripe()
  const elements = useElements()

  const [loading, setLoading] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return

    setLoading(true)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`,
      },
    })

    if (error) {
      alert(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-xl bg-slate-900 p-4 rounded-2xl border border-slate-700">
      <PaymentElement />

      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl py-3"
      >
        {loading ? "Elaborazione…" : "Paga ora"}
      </button>
    </div>
  )
}