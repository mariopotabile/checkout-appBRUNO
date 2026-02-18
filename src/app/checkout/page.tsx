// src/app/checkout/page.tsx
"use client"

import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  ChangeEvent,
  FormEvent,
  Suspense,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe, Stripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

export const dynamic = "force-dynamic"

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents?: number
  linePriceCents?: number
  image?: string
}

type CartSessionResponse = {
  sessionId: string
  currency: string
  items: CheckoutItem[]
  subtotalCents?: number
  shippingCents?: number
  totalCents?: number
  paymentIntentClientSecret?: string
  discountCodes?: { code: string }[]
  rawCart?: any
  shopDomain?: string
  error?: string
}

type CustomerForm = {
  fullName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  postalCode: string
  province: string
  countryCode: string
}

function formatMoney(cents: number | undefined, currency: string = "EUR") {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

function CheckoutInner({
  cart,
  sessionId,
}: {
  cart: CartSessionResponse
  sessionId: string
}) {
  const stripe = useStripe()
  const elements = useElements()

  const cartUrl = "https://oltreboutique.com/cart"

  const [customer, setCustomer] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "GB",
  })

  const [useDifferentBilling, setUseDifferentBilling] = useState(false)
  const [billingAddress, setBillingAddress] = useState<CustomerForm>({
    fullName: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postalCode: "",
    province: "",
    countryCode: "GB",
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [calculatedShippingCents, setCalculatedShippingCents] =
    useState<number>(0)
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [shippingError, setShippingError] = useState<string | null>(null)
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false)

  const [lastCalculatedHash, setLastCalculatedHash] = useState<string>("")
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const addressInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)
  const scriptLoadedRef = useRef(false)

  const currency = (cart.currency || "EUR").toUpperCase()

  const subtotalCents = useMemo(() => {
    if (typeof cart.subtotalCents === "number") return cart.subtotalCents
    return cart.items.reduce((sum, item) => {
      const line = item.linePriceCents ?? item.priceCents ?? 0
      return sum + line
    }, 0)
  }, [cart])

  const shippingCents = calculatedShippingCents

  const discountCents = useMemo(() => {
    const shopifyTotal =
      typeof cart.totalCents === "number" ? cart.totalCents : subtotalCents
    const raw = subtotalCents - shopifyTotal
    return raw > 0 ? raw : 0
  }, [subtotalCents, cart.totalCents])

  const SHIPPING_COST_CENTS = 0
  const FREE_SHIPPING_THRESHOLD_CENTS = 0
  const shippingToApply = 0
  const totalToPayCents = subtotalCents - discountCents + shippingToApply

  const firstName = customer.fullName.split(" ")[0] || ""
  const lastName = customer.fullName.split(" ").slice(1).join(" ") || ""

  const billingFirstName = billingAddress.fullName.split(" ")[0] || ""
  const billingLastName =
    billingAddress.fullName.split(" ").slice(1).join(" ") || ""

  function handleCustomerChange(
    field: keyof CustomerForm,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const value = e.target.value
    setCustomer((prev) => ({ ...prev, [field]: value }))
  }

  function handleBillingChange(
    field: keyof CustomerForm,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const value = e.target.value
    setBillingAddress((prev) => ({ ...prev, [field]: value }))
  }

  function isFormValid() {
    const shippingValid =
      customer.fullName.trim().length > 2 &&
      customer.email.trim().length > 3 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2

    if (!useDifferentBilling) {
      return shippingValid
    }

    const billingValid =
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2

    return shippingValid && billingValid
  }

  useEffect(() => {
    async function calculateShipping() {
      const formHash = JSON.stringify({
        fullName: customer.fullName.trim(),
        email: customer.email.trim(),
        phone: customer.phone.trim(),
        address1: customer.address1.trim(),
        city: customer.city.trim(),
        postalCode: customer.postalCode.trim(),
        province: customer.province.trim(),
        countryCode: customer.countryCode,
        billingFullName: useDifferentBilling
          ? billingAddress.fullName.trim()
          : "",
        billingAddress1: useDifferentBilling
          ? billingAddress.address1.trim()
          : "",
        subtotal: subtotalCents,
        discount: discountCents,
      })

      if (!isFormValid()) {
        setCalculatedShippingCents(0)
        setClientSecret(null)
        setShippingError(null)
        setLastCalculatedHash("")
        return
      }

      if (formHash === lastCalculatedHash && clientSecret) {
        console.log("[Checkout] 💾 Form unchanged, reusing Payment Intent")
        return
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(async () => {
        setIsCalculatingShipping(true)
        setError(null)
        setShippingError(null)

        try {
          const flatShippingCents = 0
          setCalculatedShippingCents(flatShippingCents)

          const shopifyTotal =
            typeof cart.totalCents === "number"
              ? cart.totalCents
              : subtotalCents
          const currentDiscountCents = subtotalCents - shopifyTotal
          const finalDiscountCents =
            currentDiscountCents > 0 ? currentDiscountCents : 0
          const newTotalCents =
            subtotalCents - finalDiscountCents + flatShippingCents

          console.log("[Checkout] 🆕 Creating Payment Intent...")

          const piRes = await fetch("/api/payment-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              amountCents: newTotalCents,
              customer: {
                fullName: customer.fullName,
                email: customer.email,
                phone: customer.phone,
                address1: customer.address1,
                address2: customer.address2,
                city: customer.city,
                postalCode: customer.postalCode,
                province: customer.province,
                countryCode: customer.countryCode || "GB",
              },
            }),
          })

          const piData = await piRes.json()

          if (!piRes.ok || !piData.clientSecret) {
            throw new Error(piData.error || "Payment creation error")
          }

          console.log("[Checkout] ✅ ClientSecret received")
          setClientSecret(piData.clientSecret)
          setLastCalculatedHash(formHash)
          setIsCalculatingShipping(false)
        } catch (err: any) {
          console.error("Payment creation error:", err)
          setShippingError(err.message || "Error calculating total")
          setIsCalculatingShipping(false)
        }
      }, 1000)
    }

    calculateShipping()

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [
    customer.fullName,
    customer.email,
    customer.phone,
    customer.address1,
    customer.address2,
    customer.city,
    customer.postalCode,
    customer.province,
    customer.countryCode,
    billingAddress.fullName,
    billingAddress.address1,
    billingAddress.city,
    billingAddress.postalCode,
    billingAddress.province,
    billingAddress.countryCode,
    useDifferentBilling,
    sessionId,
    subtotalCents,
    cart.totalCents,
    clientSecret,
    lastCalculatedHash,
    discountCents,
  ])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!isFormValid()) {
      setError("Please fill in all required fields")
      return
    }

    if (!stripe || !elements) {
      setError("Stripe not ready")
      return
    }

    if (!clientSecret) {
      setError("Payment Intent not created")
      return
    }

    try {
      setLoading(true)

      const { error: submitError } = await elements.submit()
      if (submitError) {
        console.error("Elements submit error:", submitError)
        setError(submitError.message || "Validation error")
        setLoading(false)
        return
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {},
      })

      if (confirmError) {
        console.error("Confirm payment error:", confirmError)
        setError(confirmError.message || "Payment failed")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)

      const thankYouUrl = `/thank-you?sessionId=${encodeURIComponent(
        sessionId
      )}`

      window.location.href = thankYouUrl
    } catch (err: any) {
      console.error("Payment submit error:", err)
      setError(err.message || "Unexpected error during payment")
      setLoading(false)
    }
  }

  // UI DELLA PAGINA (tutta la parte grafica che avevi già)
  // ────────────────────────────────────────────────────────
  // Mantieni qui il tuo layout: order summary, sezioni indirizzo, ecc.
  // Importante: NON toccare il PaymentElement e i blocchi che abbiamo visto
  // perché sono già corretti per usare clientSecret.

  // Per brevità non riscrivo tutta la parte di markup del carrello:
  // copia/incolla il tuo JSX attuale sotto, usando handleSubmit nel <form>
  // e PaymentElement con clientSecret come già fai.

  // Esempio skeleton:
  return (
    <form onSubmit={handleSubmit}>
      {/* ... il tuo layout esistente (indirizzo, riepilogo, ecc.) ... */}

      {/* Blocco Payment esistente (che avevi già) */}
      <div className="shopify-section">
        <h2 className="shopify-section-title">Payment</h2>

        {/* ... badges carte, sicurezza, ecc ... */}

        {clientSecret && !isCalculatingShipping && (
          <div className="border border-gray-300 rounded-xl p-4 bg-white shadow-sm mb-4">
            <PaymentElement
              options={{
                fields: {
                  billingDetails: {
                    name: "auto",
                    email: "never",
                    phone: "never",
                    address: "never",
                  },
                },
                defaultValues: {
                  billingDetails: {
                    name: useDifferentBilling
                      ? billingAddress.fullName
                      : customer.fullName,
                  },
                },
              }}
            />
          </div>
        )}

        {!clientSecret && !isCalculatingShipping && (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm text-gray-600 text-center">
              Fill in all fields to view payment methods
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !clientSecret}
        className="w-full mt-4 py-3 px-4 bg-black text-white rounded-md disabled:opacity-60"
      >
        {loading ? "Processing..." : "Pay now"}
      </button>
    </form>
  )
}

// Wrapper con Elements & caricamento cart come già fai
function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)

  useEffect(() => {
    async function init() {
      if (!sessionId) return

      const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
      const data = (await res.json()) as CartSessionResponse

      if (data.error) {
        setCart(data)
        return
      }

      setCart(data)

      // Carica Stripe con la publishable key dall'env
      const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
      setStripePromise(loadStripe(pk))
    }

    init()
  }, [sessionId])

  if (!cart || !stripePromise) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-b-2 border-gray-800 rounded-full" />
      </div>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: cart.paymentIntentClientSecret || undefined,
        appearance: { theme: "stripe" },
      }}
    >
      <CheckoutInner cart={cart} sessionId={sessionId} />
    </Elements>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-gray-800 rounded-full" />
        </div>
      }
    >
      <CheckoutPageInner />
    </Suspense>
  )
}
