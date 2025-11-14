// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

// tipo opzionale per i dati cliente che arrivano dal checkout
type CustomerData = {
  email?: string
  firstName?: string
  lastName?: string
  address1?: string
  address2?: string
  city?: string
  province?: string
  zip?: string
  country?: string
  phone?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId = body.sessionId as string | undefined
    const customer: CustomerData = body.customer || {}
    const shippingCentsFromClient = Number(body.shippingCents ?? 0)

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    // 1) recupera carrello
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
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : 0

    // spedizione: se arriva dal client (5,90€ = 590) usiamo quella
    const shippingCents =
      shippingCentsFromClient > 0
        ? shippingCentsFromClient
        : typeof data.shippingCents === "number"
        ? data.shippingCents
        : 0

    const totalCents =
      typeof data.totalCents === "number" && !shippingCentsFromClient
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

    // 2) prendi config Stripe (secret key dal doc config)
    const cfg = await getConfig()
    const firstStripe =
      (cfg.stripeAccounts || []).find((a: any) => a.secretKey) || null

    const secretKey =
      firstStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error("[/api/payment-intent] Nessuna Stripe secret key")
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const stripe = new Stripe(secretKey)

    // 3) opzionale: salva nel carrello anche shipping + total + customer
    await db.collection(COLLECTION).doc(sessionId).set(
      {
        shippingCents,
        totalCents,
        customer,
      },
      { merge: true },
    )

    // 4) crea PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        checkout_session_id: sessionId,
      },
    })

    return NextResponse.json(
      {
        clientSecret: paymentIntent.client_secret,
      },
      { status: 200 },
    )
  } catch (error: any) {
    console.error("[/api/payment-intent] errore:", error)
    return NextResponse.json(
      { error: error.message || "Errore interno nel pagamento" },
      { status: 500 },
    )
  }
}