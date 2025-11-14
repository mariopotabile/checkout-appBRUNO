// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"   // ❤️ come nel tuo /api/payments

// Stripe cache (instanziato una sola volta)
let stripe: Stripe | null = null

async function getStripeFromFirebase(): Promise<Stripe> {
  if (stripe) return stripe

  const cfg = await getConfig()

  const firstStripe =
    (cfg.stripeAccounts || []).find((a: any) => a.secretKey) || null

  const secretKey =
    firstStripe?.secretKey ||
    process.env.STRIPE_SECRET_KEY ||
    ""

  if (!secretKey) {
    throw new Error("Nessuna Stripe Secret Key trovata né in Firebase né ENV.")
  }

  stripe = new Stripe(secretKey)
  return stripe
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    // 1) Recupera carrello da Firestore
    const snap = await db.collection("cartSessions").doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Carrello non trovato" },
        { status: 404 },
      )
    }

    const data = snap.data()!!

    // 2) Calcolo totale in centesimi
    const subtotalCents = data.totals?.subtotal ?? 0
    const shippingCents = data.shippingCents ?? 0
    const totalCents = subtotalCents + shippingCents

    if (!totalCents || totalCents < 50) {
      return NextResponse.json(
        { error: "Importo non valido" },
        { status: 400 },
      )
    }

    // 3) Otteniamo Stripe da Firebase (non ENV)
    const stripe = await getStripeFromFirebase()

    // 4) Creazione Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: { sessionId },
    })

    return NextResponse.json(
      { clientSecret: paymentIntent.client_secret },
      { status: 200 }
    )

  } catch (err: any) {
    console.error("PAYMENT INTENT ERROR:", err)
    return NextResponse.json(
      { error: err.message || "Errore creazione PaymentIntent" },
      { status: 500 }
    )
  }
}