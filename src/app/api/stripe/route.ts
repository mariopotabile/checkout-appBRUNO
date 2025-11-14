// src/app/api/stripe/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getConfig } from "@/lib/config"

// Webhook Stripe: riceve eventi da uno o più account Stripe
// e verifica la firma usando i webhook secret configurati.

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    )
  }

  const rawBody = await req.text()

  // Config dal nostro storage (Firebase / file JSON)
  const cfg: any = await getConfig()

  // webhookSecret da configurazione multi-account
  const configSecrets: string[] = Array.isArray(cfg.stripeAccounts)
    ? cfg.stripeAccounts
        .map((a: any) => a.webhookSecret)
        .filter((s: any) => typeof s === "string" && s.length > 0)
    : []

  // webhookSecret da env (fallback singolo)
  const envSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (envSecret) {
    configSecrets.push(envSecret)
  }

  if (!configSecrets.length) {
    console.error("[stripe webhook] Nessun webhook secret configurato")
    return NextResponse.json(
      { error: "Nessun webhook secret configurato" },
      { status: 500 }
    )
  }

  // Per il webhook non serve fissare la apiVersion:
  // usiamo la versione associata alla chiave, quindi config vuota.
  const firstKey =
    process.env.STRIPE_SECRET_KEYS?.split(",")[0] ||
    process.env.STRIPE_SECRET_KEY ||
    "sk_test_1234567890"

  const stripe = new Stripe(firstKey, {} as any)

  let event: Stripe.Event | null = null
  let matchedSecret: string | null = null

  // Proviamo tutti i secret finché uno valida la firma
  for (const secret of configSecrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret)
      matchedSecret = secret
      break
    } catch (err) {
      // firma non valida per questo secret, provo il prossimo
      continue
    }
  }

  if (!event) {
    console.error("[stripe webhook] Signature verification failed")
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 400 }
    )
  }

  console.log(
    "[stripe webhook] event type:",
    event.type,
    "matchedSecret:",
    !!matchedSecret
  )

  // Gestione base degli eventi chiave
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(
        "[stripe webhook] checkout.session.completed",
        session.id,
        session.payment_status
      )
      break
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent
      console.log("[stripe webhook] payment_intent.succeeded", pi.id)
      break
    }

    default:
      console.log("[stripe webhook] unhandled event:", event.type)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}