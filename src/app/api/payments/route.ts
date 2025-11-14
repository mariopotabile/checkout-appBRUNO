// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"   // ✅ FIX

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId = body.sessionId as string | undefined

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    // 1) Recupera la sessione carrello da Firestore
    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato per questa sessione" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}

    const currency = (data.currency || "EUR").toString().toLowerCase()

    const subtotalCents =
      typeof data.subtotalCents === "number" ? data.subtotalCents : (data.totals?.subtotal ?? 0)

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    if (!totalCents || totalCents < 50) {
      return NextResponse.json(
        {
          error:
            "Importo non valido. Verifica il totale ordine prima di procedere al pagamento.",
        },
        { status: 400 },
      )
    }

    const cfg = await getConfig()

    const firstStripe =
      (cfg.stripeAccounts || []).find((a) => a.secretKey) || null

    const secretKey =
      firstStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error("[/api/payments] Nessuna Stripe secret key configurata")
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const stripe = new Stripe(secretKey)

    const baseDomain =
      cfg.checkoutDomain ||
      process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN ||
      req.headers.get("origin") ||
      "https://checkout-app-green.vercel.app"

    const successUrl = `${baseDomain}/thank-you?sessionId=${encodeURIComponent(
      sessionId,
    )}&stripeSessionId={CHECKOUT_SESSION_ID}`

    const cancelUrl = `${baseDomain}/checkout?sessionId=${encodeURIComponent(
      sessionId,
    )}&canceled=1`

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "Ordine Not For Resale",
              description: `Checkout session ${sessionId}`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    return NextResponse.json({ url: session.url }, { status: 200 })

  } catch (error: any) {
    console.error("[/api/payments] errore:", error)
    return NextResponse.json(
      { error: error.message || "Errore interno nel pagamento" },
      { status: 500 },
    )
  }
}