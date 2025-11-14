// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

// Cache dell'istanza Stripe (evita di crearla ogni volta)
let stripe: Stripe | null = null

async function getStripeFromFirebase(): Promise<Stripe> {
  if (stripe) return stripe

  const cfg = await getConfig()

  // Prendiamo il primo account con secretKey valorizzata
  const firstStripe =
    (cfg.stripeAccounts || []).find((a: any) => a.secretKey) || null

  const secretKey = firstStripe?.secretKey || ""

  if (!secretKey) {
    throw new Error("Nessuna Stripe secret key configurata in Firebase.")
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

    // 1) Recupero carrello da Firestore
    const snap = await db.collection("cartSessions").doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Carrello non trovato" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}

    // 2) Calcolo totale (cent)
    const subtotalCents = data.totals?.subtotal ?? 0
    const shippingCents = data.shippingCents ?? 0
    const totalCents = subtotalCents + shippingCents

    if (!totalCents || totalCents < 50) {
      return NextResponse.json(
        { error: "Importo non valido o troppo basso" },
        { status: 400 },
      )
    }

    // 3) Inizializzo Stripe da Firebase
    const stripe = await getStripeFromFirebase()

    // 4) Creo PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        sessionId,
      },
    })

    if (!paymentIntent.client_secret) {
      return NextResponse.json(
        { error: "Impossibile ottenere clientSecret da Stripe" },
        { status: 500 },
      )
    }

    // 5) Ritorno clientSecret al frontend
    return NextResponse.json(
      { clientSecret: paymentIntent.client_secret },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/payment-intent] errore:", err)
    return NextResponse.json(
      { error: err.message || "Errore creazione PaymentIntent" },
      { status: 500 },
    )
  }
}