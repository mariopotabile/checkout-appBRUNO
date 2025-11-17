"use client"

import React, {
  Suspense,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
} from "react"
import { useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
)

/* -------------------------------------------------------------------------- */
/*                                  TIPI                                      */
/* -------------------------------------------------------------------------- */

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
  rawCart: any
  error?: string
}

type Customer = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  province: string
  zip: string
  country: string
}

const FIXED_SHIPPING_CENTS = 590

/* -------------------------------------------------------------------------- */
/*                           COMPONENTE PRINCIPALE                            */
/* -------------------------------------------------------------------------- */

function CheckoutPageInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [items, setItems] = useState<CheckoutItem[]>([])
  const [rawCart, setRawCart] = useState<any>(null)
  const [currency, setCurrency] = useState("EUR")

  // Valori REALI DA SHOPIFY
  const [subtotalProducts, setSubtotalProducts] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [subtotalFinal, setSubtotalFinal] = useState(0)

  const [shippingCents, setShippingCents] = useState(0)
  const [totalCents, setTotalCents] = useState(0)

  const [clientSecret, setClientSecret] = useState<string | null>(null)

  const [customer, setCustomer] = useState<Customer>({
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

  /* -------------------------------------------------------------------------- */
  /*                       CARICA SESSIONE (RAW CART)                          */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!sessionId) {
      setError("Nessuna sessione di checkout trovata.")
      setLoading(false)
      return
    }

    ;(async () => {
      try {
        const res = await fetch(
          `/api/cart-session?sessionId=${encodeURIComponent(sessionId)}`,
        )
        const data: CartSessionResponse = await res.json()

        if (!res.ok) {
          setError(data.error || "Errore nel recupero del carrello")
          setLoading(false)
          return
        }

        const raw = data.rawCart || {}

        setItems(data.items || [])
        setRawCart(raw)
        setCurrency((data.currency || "EUR").toUpperCase())

        const original = Number(raw.original_total_price ?? 0)
        const final = Number(raw.total_price ?? 0)
        const discountValue =
          typeof raw.total_discount === "number"
            ? Number(raw.total_discount)
            : Math.max(0, original - final)

        // Se Shopify non ha ancora sconto, fallback sul subtotale finale
        const safeOriginal = original || final + discountValue

        setSubtotalProducts(safeOriginal)
        setSubtotalFinal(final || safeOriginal - discountValue)
        setDiscount(discountValue)

        // Di base il totale è il totale Shopify (senza shipping esterna)
        setTotalCents(final || safeOriginal - discountValue)
      } catch (e) {
        console.error(e)
        setError("Errore nel caricamento del carrello")
      } finally {
        setLoading(false)
      }
    })()
  }, [sessionId])

  /* -------------------------------------------------------------------------- */
  /*                SHIPPING: si attiva solo a campi compilati                  */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    const ok =
      customer.firstName.trim() &&
      customer.lastName.trim() &&
      customer.email.trim() &&
      customer.address1.trim() &&
      customer.zip.trim() &&
      customer.city.trim() &&
      customer.province.trim()

    if (ok) {
      setShippingCents(FIXED_SHIPPING_CENTS)
      setTotalCents(subtotalFinal + FIXED_SHIPPING_CENTS)
    } else {
      setShippingCents(0)
      setTotalCents(subtotalFinal)
    }
  }, [customer, subtotalFinal])

  /* -------------------------------------------------------------------------- */
  /*                    CREA PAYMENT INTENT (sempre FINAL)                      */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!subtotalFinal) return
    if (!shippingCents) return
    if (!sessionId) return

    ;(async () => {
      try {
        const res = await fetch("/api/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            shippingCents,
            customer,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          console.error("Errore payment-intent:", data)
          return
        }
        setClientSecret(data.clientSecret)
      } catch (e) {
        console.error("Errore payment-intent:", e)
      }
    })()
  }, [subtotalFinal, shippingCents, sessionId, customer])

  const itemsCount = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.quantity || 0), 0),
    [items],
  )

  if (loading)
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black">
        Caricamento…
      </main>
    )

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-black p-4">
        <div className="max-w-md w-full border border-red-200 rounded-2xl p-5 bg-red-50 text-center">
          <h1 className="text-lg font-semibold mb-2">Errore checkout</h1>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-black text-white px-4 py-2 text-sm font-medium"
          >
            Torna allo shop
          </a>
        </div>
      </main>
    )

  /* Formattazioni */
  const f = (n: number) => (n / 100).toFixed(2)

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-white text-black px-4 py-6 md:px-6 lg:px-10">
      {/* HEADER CON LOGO */}
      <header className="mb-8 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.history.back()
            }
          }}
          className="inline-flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.shopify.com/s/files/1/0899/2188/0330/files/logo_checkify_d8a640c7-98fe-4943-85c6-5d1a633416cf.png?v=1761832152"
            alt="NOT FOR RESALE"
            className="h-12 md:h-14 w-auto"
          />
        </button>
      </header>

      <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* COLONNA SINISTRA */}
        <section className="space-y-6 md:space-y-8">
          {/* TITOLO */}
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Checkout
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Completa i dati di spedizione e paga in modo sicuro.
            </p>
          </div>

          {/* DATI SPEDIZIONE */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Dati di spedizione
            </h2>
            <ShippingForm customer={customer} setCustomer={setCustomer} />
            <p className="mt-3 text-[11px] text-gray-500">
              La spedizione verrà aggiunta automaticamente dopo aver inserito
              tutti i dati obbligatori.
            </p>
          </div>

          {/* ARTICOLI NEL CARRELLO */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Articoli nel carrello
              </h2>
              <span className="text-xs text-gray-500">
                ({itemsCount} {itemsCount === 1 ? "articolo" : "articoli"})
              </span>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const rawItem = rawCart?.items?.find(
                  (r: any) =>
                    String(r.id) === String(item.id) ||
                    String(r.variant_id) === String(item.id),
                )

                const qty = Number(rawItem?.quantity ?? item.quantity ?? 1)

                const finalLineCents =
                  typeof rawItem?.final_line_price === "number"
                    ? rawItem.final_line_price
                    : item.linePriceCents ??
                      (item.priceCents || 0) * qty

                const originalLineCents =
                  typeof rawItem?.original_line_price === "number"
                    ? rawItem.original_line_price
                    : (item.priceCents || 0) * qty

                const unitFinal = finalLineCents / 100 / qty
                const saving =
                  originalLineCents > finalLineCents
                    ? (originalLineCents - finalLineCents) / 100
                    : 0

                return (
                  <div
                    key={idx}
                    className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-3"
                  >
                    {item.image && (
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-white border border-gray-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 line-clamp-2">
                        {item.title}
                      </div>
                      {item.variantTitle && (
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {item.variantTitle}
                        </div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-500">
                        {qty}× {unitFinal.toFixed(2)} {currency}
                      </div>
                      {saving > 0 && (
                        <div className="mt-0.5 text-[11px] text-emerald-600">
                          Risparmi {saving.toFixed(2)} {currency}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end justify-center text-sm font-semibold text-gray-900">
                      {(finalLineCents / 100).toFixed(2)} {currency}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* COLONNA DESTRA */}
        <section className="space-y-6 lg:space-y-8">
          {/* RIEPILOGO */}
          <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">
              Riepilogo ordine
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotale prodotti</span>
                <span>
                  {f(subtotalProducts)} {currency}
                </span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between">
                  <span>Sconto</span>
                  <span className="text-red-600">
                    −{f(discount)} {currency}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Subtotale</span>
                <span>
                  {f(subtotalFinal)} {currency}
                </span>
              </div>

              <div className="flex justify-between">
                <span>Spedizione</span>
                <span>
                  {shippingCents
                    ? `${f(shippingCents)} ${currency}`
                    : "Aggiunta dopo l'indirizzo"}
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-3 flex justify-between items-baseline">
              <span className="text-sm font-semibold text-gray-900">
                Totale
              </span>
              <span className="text-lg font-semibold text-gray-900">
                {f(totalCents)} {currency}
              </span>
            </div>
          </div>

          {/* PAGAMENTO */}
          <PaymentSection
            clientSecret={clientSecret}
            sessionId={sessionId}
            customer={customer}
            totalFormatted={`${f(totalCents)} ${currency}`}
          />
        </section>
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 SUBCOMPONENTI                               */
/* -------------------------------------------------------------------------- */

function ShippingForm({
  customer,
  setCustomer,
}: {
  customer: Customer
  setCustomer: React.Dispatch<React.SetStateAction<Customer>>
}) {
  function handle(field: keyof Customer, e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setCustomer(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          placeholder="Nome"
          value={customer.firstName}
          onChange={e => handle("firstName", e)}
        />
        <Input
          placeholder="Cognome"
          value={customer.lastName}
          onChange={e => handle("lastName", e)}
        />
      </div>

      <Input
        placeholder="Email"
        type="email"
        value={customer.email}
        onChange={e => handle("email", e)}
      />
      <Input
        placeholder="Telefono"
        value={customer.phone}
        onChange={e => handle("phone", e)}
      />

      <Input
        placeholder="Indirizzo"
        value={customer.address1}
        onChange={e => handle("address1", e)}
      />
      <Input
        placeholder="Interno / scala / citofono (opzionale)"
        value={customer.address2}
        onChange={e => handle("address2", e)}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder="CAP"
          value={customer.zip}
          onChange={e => handle("zip", e)}
        />
        <Input
          placeholder="Città"
          value={customer.city}
          onChange={e => handle("city", e)}
        />
        <Input
          placeholder="Provincia"
          value={customer.province}
          onChange={e => handle("province", e)}
        />
      </div>

      <Input
        placeholder="Paese"
        value={customer.country}
        onChange={e => handle("country", e)}
      />
    </div>
  )
}

function PaymentSection({
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
      <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm text-sm text-gray-500">
        Inserisci i dati di spedizione per attivare il pagamento.
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
        colorText: "#111111",
        colorDanger: "#df1c41",
        borderRadius: "10px",
      },
      rules: {
        ".Block": {
          borderRadius: "12px",
          border: "1px solid #111111",
          boxShadow: "none",
        },
        ".Input": {
          borderRadius: "10px",
          border: "1px solid #111111",
          padding: "10px 12px",
          backgroundColor: "#ffffff",
          boxShadow: "none",
        },
        ".Input:focus": {
          borderColor: "#000000",
          boxShadow: "0 0 0 1px #000000",
        },
        ".Input--invalid": {
          borderColor: "#df1c41",
          boxShadow: "0 0 0 1px #df1c41",
        },
      },
    },
  }

  return (
    <div className="border border-gray-200 rounded-3xl p-5 md:p-6 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Pagamento con carta
        </h2>
        <p className="text-[11px] text-gray-500">
          Tutte le transazioni sono sicure.
        </p>
      </div>

      <Elements stripe={stripePromise} options={options}>
        <PaymentInner
          sessionId={sessionId}
          customer={customer}
          totalFormatted={totalFormatted}
        />
      </Elements>
    </div>
  )
}

function PaymentInner({
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

  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const pay = async () => {
    if (!stripe || !elements) return
    setLoading(true)
    setErr(null)

    const fullName =
      name.trim() ||
      `${customer.firstName} ${customer.lastName}`.trim() ||
      undefined

    try {
      const { error, paymentIntent }: any = await stripe.confirmPayment({
        elements,
        confirmParams: {
          payment_method_data: {
            billing_details: {
              name: fullName,
              email: customer.email || undefined,
              phone: customer.phone || undefined,
              address: {
                line1: customer.address1 || undefined,
                line2: customer.address2 || undefined,
                city: customer.city || undefined,
                postal_code: customer.zip || undefined,
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
        setErr(error.message || "Errore durante il pagamento")
        setLoading(false)
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
        return
      }

      setErr("Pagamento non completato. Riprova.")
      setLoading(false)
    } catch (e: any) {
      console.error(e)
      setErr(e?.message || "Errore imprevisto durante il pagamento")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Nome completo sull&apos;intestatario della carta
        </label>
        <Input
          placeholder="Es. Mario Rossi"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border border-black/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] px-4 py-5">
        <PaymentElement />
      </div>

      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}

      <button
        disabled={!stripe || !elements || loading}
        onClick={pay}
        className="w-full inline-flex items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60"
      >
        {loading ? "Elaborazione…" : `Paga ora ${totalFormatted}`}
      </button>

      <p className="text-[11px] text-gray-500">
        I pagamenti sono elaborati in modo sicuro da Stripe. I dati della carta
        non passano mai sui nostri server.
      </p>
    </div>
  )
}

/* ---------------------------------------------
   INPUT GENERICO
---------------------------------------------- */

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

function Input(props: InputProps) {
  const { className = "", ...rest } = props
  return (
    <input
      className={[
        "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-black focus:border-black",
        "transition-shadow",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

/* ---------------------------------------------
   EXPORT
---------------------------------------------- */

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div>Caricamento checkout…</div>}>
      <CheckoutPageInner />
    </Suspense>
  )
}