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

/**
 * ======================
 *  CHECKOUT INNER FORM
 * ======================
 */
function CheckoutInner({
  cart,
  sessionId,
  onClientSecret,
}: {
  cart: CartSessionResponse
  sessionId: string
  onClientSecret: (cs: string | null) => void
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

  /**
   * Google Places Autocomplete
   */
  useEffect(() => {
    let mounted = true
    const win = window as any

    const initAutocomplete = () => {
      if (!mounted || !addressInputRef.current) return
      if (!win.google?.maps?.places) return

      try {
        if (autocompleteRef.current) {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
          autocompleteRef.current = null
        }

        autocompleteRef.current = new win.google.maps.places.Autocomplete(
          addressInputRef.current,
          {
            types: ["address"],
            componentRestrictions: {
              country: [
                "gb",
                "ie",
                "it",
                "fr",
                "de",
                "es",
                "at",
                "be",
                "nl",
                "ch",
                "pt",
              ],
            },
            fields: ["address_components", "formatted_address", "geometry"],
          }
        )

        autocompleteRef.current.addListener("place_changed", () => {
          if (!mounted) return
          handlePlaceSelect()
        })
      } catch (err) {
        console.error("[Autocomplete] Error:", err)
      }
    }

    if (!win.google?.maps?.places && !scriptLoadedRef.current) {
      scriptLoadedRef.current = true
      const script = document.createElement("script")
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

      if (!apiKey) {
        console.error("[Autocomplete] API Key missing")
        return
      }

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=en&callback=initGoogleMaps`
      script.async = true
      script.defer = true

      win.initGoogleMaps = () => {
        requestAnimationFrame(() => {
          if (mounted) initAutocomplete()
        })
      }

      script.onerror = () => {
        console.error("[Autocomplete] Loading error")
      }

      document.head.appendChild(script)
    } else if (win.google?.maps?.places) {
      initAutocomplete()
    }

    return () => {
      mounted = false
      if (autocompleteRef.current && win.google?.maps?.event) {
        try {
          win.google.maps.event.clearInstanceListeners(autocompleteRef.current)
        } catch (e) {}
      }
    }
  }, [])

  function handlePlaceSelect() {
    const place = autocompleteRef.current?.getPlace()
    if (!place || !place.address_components) return

    let street = ""
    let streetNumber = ""
    let city = ""
    let province = ""
    let postalCode = ""
    let country = ""

    place.address_components.forEach((component: any) => {
      const types = component.types
      if (types.includes("route")) street = component.long_name
      if (types.includes("street_number")) streetNumber = component.long_name
      if (types.includes("locality")) city = component.long_name
      if (types.includes("postal_town") && !city) city = component.long_name
      if (types.includes("administrative_area_level_3") && !city)
        city = component.long_name
      if (types.includes("administrative_area_level_2"))
        province = component.short_name
      if (types.includes("administrative_area_level_1") && !province)
        province = component.short_name
      if (types.includes("postal_code")) postalCode = component.long_name
      if (types.includes("country")) country = component.short_name
    })

    const fullAddress = streetNumber ? `${street} ${streetNumber}` : street

    setCustomer((prev) => ({
      ...prev,
      address1: fullAddress || prev.address1,
      city: city || prev.city,
      postalCode: postalCode || prev.postalCode,
      province: province || prev.province,
      countryCode: country || prev.countryCode,
    }))
  }

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setCustomer((prev) => ({ ...prev, [name]: value }))
  }

  function isFormValid() {
    const shippingValid =
      customer.fullName.trim().length > 2 &&
      customer.email.trim().includes("@") &&
      customer.email.trim().length > 5 &&
      customer.phone.trim().length > 8 &&
      customer.address1.trim().length > 3 &&
      customer.city.trim().length > 1 &&
      customer.postalCode.trim().length > 2 &&
      customer.province.trim().length > 1 &&
      customer.countryCode.trim().length >= 2

    if (!useDifferentBilling) return shippingValid

    const billingValid =
      billingAddress.fullName.trim().length > 2 &&
      billingAddress.address1.trim().length > 3 &&
      billingAddress.city.trim().length > 1 &&
      billingAddress.postalCode.trim().length > 2 &&
      billingAddress.province.trim().length > 1 &&
      billingAddress.countryCode.trim().length >= 2

    return shippingValid && billingValid
  }

  /**
   * Calcolo spedizione + creazione PaymentIntent
   * e passaggio clientSecret verso il parent tramite onClientSecret
   */
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
        billingFullName: useDifferentBilling ? billingAddress.fullName.trim() : "",
        billingAddress1: useDifferentBilling ? billingAddress.address1.trim() : "",
        subtotal: subtotalCents,
        discount: discountCents,
      })

      if (!isFormValid()) {
        setCalculatedShippingCents(0)
        onClientSecret(null)
        setShippingError(null)
        setLastCalculatedHash("")
        return
      }

      if (formHash === lastCalculatedHash) {
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
          onClientSecret(piData.clientSecret)
          setLastCalculatedHash(formHash)
          setIsCalculatingShipping(false)
        } catch (err: any) {
          console.error("Payment creation error:", err)
          setShippingError(err.message || "Error calculating total")
          onClientSecret(null)
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
    lastCalculatedHash,
    discountCents,
    onClientSecret,
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

    try {
      setLoading(true)

      const { error: submitError } = await elements.submit()
      if (submitError) {
        console.error("Elements submit error:", submitError)
        setError(submitError.message || "Validation error")
        setLoading(false)
        return
      }

      const finalBillingAddress = useDifferentBilling ? billingAddress : customer

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        // clientSecret non necessario: è già legato agli Elements,
        // ma puoi lasciarlo se vuoi passarlo esplicitamente
        confirmParams: {
          return_url: `${window.location.origin}/thank-you?sessionId=${sessionId}`,
          payment_method_data: {
            billing_details: {
              name: finalBillingAddress.fullName || customer.fullName,
              email: customer.email,
              phone: finalBillingAddress.phone || customer.phone,
              address: {
                line1: finalBillingAddress.address1,
                line2: finalBillingAddress.address2 || undefined,
                city: finalBillingAddress.city,
                postal_code: finalBillingAddress.postalCode,
                state: finalBillingAddress.province,
                country: finalBillingAddress.countryCode || "GB",
              },
            },
            metadata: {
              session_id: sessionId,
              customer_fullName: customer.fullName,
              customer_email: customer.email,
              shipping_city: customer.city,
              shipping_postal: customer.postalCode,
              shipping_country: customer.countryCode,
              checkout_type: "custom",
            },
          },
        },
        redirect: "if_required",
      })

      if (stripeError) {
        console.error("Stripe error:", stripeError)
        setError(stripeError.message || "Payment failed")
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)

      setTimeout(() => {
        window.location.href = `/thank-you?sessionId=${sessionId}`
      }, 2000)
    } catch (err: any) {
      console.error("Payment error:", err)
      setError(err.message || "Unexpected error")
      setLoading(false)
    }
  }

  /**
   * --- qui sotto TUTTO il markup originale della pagina ---
   * (non lo tocco, solo assicurati che il PaymentElement sia presente)
   */

  return (
    <>
      {/* tuoi <style jsx global> e tutto il resto invariato... */}
      {/* ... */}
      {/* Nel punto del pagamento assicurati di avere: */}
      <div className="shopify-section">
        <h2 className="shopify-section-title">Payment</h2>

        {/* Stripe Payment Element */}
        <div className="mt-4">
          <PaymentElement />
        </div>

        {shippingError && (
          <p className="mt-3 text-sm text-red-600">{shippingError}</p>
        )}
      </div>

      {/* Pulsante di conferma */}
      <button
        type="submit"
        disabled={loading || !stripe || !elements || isCalculatingShipping}
        className="shopify-btn mt-4"
      >
        {loading ? "Processing..." : "Complete order"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-green-600">
          Payment successful! Redirecting...
        </p>
      )}
    </>
  )
}

/**
 * ======================
 *  PAGE WRAPPER
 * ======================
 */
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
)

function CheckoutPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [cart, setCart] = useState<CartSessionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      return
    }

    async function fetchCart() {
      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()
        setCart(data)
      } catch (err) {
        console.error("Error fetching cart:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchCart()
  }, [sessionId])

  const appearance = {
    theme: "stripe" as const,
    variables: {
      colorPrimary: "#2C6ECB",
      colorBackground: "#ffffff",
      colorText: "#333333",
      colorDanger: "#df1b41",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      spacingUnit: "4px",
      borderRadius: "10px",
      fontSizeBase: "16px",
    },
  }

  const elementsOptions =
    clientSecret != null
      ? {
          clientSecret,
          appearance,
        }
      : undefined

  if (!sessionId) {
    return <div className="p-4">Missing sessionId</div>
  }

  if (loading || !cart) {
    return <div className="p-4">Loading checkout...</div>
  }

  if (!elementsOptions) {
    // form non ancora valido o PI non creato
    return (
      <div className="p-4">
        {/* puoi mostrare il form di shipping anche qui, dipende da come strutturi l’UI.
            L’importante è che il bottone di pagamento resti disabilitato
            finché clientSecret è null. */}
        <p>Fill in your details to enable payment…</p>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="max-w-6xl mx-auto px-4 pb-8 mt-6"
      >
        <CheckoutInner
          cart={cart}
          sessionId={sessionId}
          onClientSecret={setClientSecret}
        />
      </form>
    </Elements>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading…</div>}>
      <CheckoutPageContent />
    </Suspense>
  )
}

