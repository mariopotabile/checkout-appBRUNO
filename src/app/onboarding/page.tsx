"use client"

import { useEffect, useState } from "react"

interface StripeAccountForm {
  label: string
  secretKey: string
  webhookSecret: string
}

export default function OnboardingPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [checkoutDomain, setCheckoutDomain] = useState("")
  const [shopDomain, setShopDomain] = useState("")
  const [shopToken, setShopToken] = useState("")

  const [stripeAccounts, setStripeAccounts] = useState<StripeAccountForm[]>([
    { label: "Account 1", secretKey: "", webhookSecret: "" },
    { label: "Account 2", secretKey: "", webhookSecret: "" },
    { label: "Account 3", secretKey: "", webhookSecret: "" },
    { label: "Account 4", secretKey: "", webhookSecret: "" },
  ])

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/config")
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || "Errore nel recupero config")
        }

        setCheckoutDomain(data.checkoutDomain || "")
        setShopDomain(data.shopify?.shopDomain || "")
        setShopToken(data.shopify?.adminToken || "")
        if (Array.isArray(data.stripeAccounts)) {
          setStripeAccounts((prev) =>
            prev.map((acc, idx) => ({
              ...acc,
              label: data.stripeAccounts[idx]?.label || acc.label,
            })),
          )
        }
      } catch (err: any) {
        console.error("Onboarding load error:", err)
        setError(err.message || "Errore nel recupero configurazione")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const body = {
        checkoutDomain,
        shopify: {
          shopDomain,
          adminToken: shopToken,
          apiVersion: "2024-10",
        },
        stripeAccounts,
      }

      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Errore nel salvataggio")
      }

      setSuccess("Configurazione salvata con successo ✅")
    } catch (err: any) {
      console.error("Onboarding save error:", err)
      setError(err.message || "Errore nel salvataggio")
    } finally {
      setSaving(false)
    }
  }

  function updateStripeAccount(index: number, field: keyof StripeAccountForm, value: string) {
    setStripeAccounts((prev) =>
      prev.map((acc, idx) => (idx === index ? { ...acc, [field]: value } : acc)),
    )
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Caricamento…</div>
  }

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold mb-2">Onboarding Checkout</h1>
        <p className="text-gray-600 text-sm">
          Configura dominio di checkout, Shopify e account Stripe (fino a 4).
        </p>

        {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-100 text-green-700 rounded-lg text-sm">{success}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-semibold text-lg">Dominio Checkout</h2>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="https://checkout-app-xxxxx.vercel.app"
              value={checkoutDomain}
              onChange={(e) => setCheckoutDomain(e.target.value)}
              required
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-lg">Shopify</h2>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="imjsqk-my.myshopify.com"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              required
            />
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2"
              placeholder="Admin API Access Token"
              value={shopToken}
              onChange={(e) => setShopToken(e.target.value)}
              required
            />
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-lg">Stripe accounts</h2>

            {stripeAccounts.map((acc, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-2 bg-gray-50">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{acc.label}</span>
                  <span className="text-xs text-gray-500">#{idx + 1}</span>
                </div>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-xs"
                  placeholder="sk_live_..."
                  value={acc.secretKey}
                  onChange={(e) => updateStripeAccount(idx, "secretKey", e.target.value)}
                />
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-xs"
                  placeholder="whsec_... (webhook secret, opzionale)"
                  value={acc.webhookSecret}
                  onChange={(e) => updateStripeAccount(idx, "webhookSecret", e.target.value)}
                />
              </div>
            ))}
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition disabled:opacity-60"
          >
            {saving ? "Salvataggio..." : "Salva configurazione"}
          </button>
        </form>
      </div>
    </main>
  )
}