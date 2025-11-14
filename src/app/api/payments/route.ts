// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getConfig, StripeAccount } from "@/lib/config"

let rrIndex = -1

function pickStripeAccount(accounts: StripeAccount[]): StripeAccount | null {
  const usable = accounts.filter((a) => a.secretKey && a.secretKey.trim().length > 10)

  if (!usable.length) return null

  rrIndex = (rrIndex + 1) % usable.length
  return usable[rrIndex]
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let { totalAmount, currency, description } = body

    if (!totalAmount || typeof totalAmount !== "number") {
      return NextResponse.json(
        { error: "totalAmount (in centesimi) mancante o non valido" },
        { status: 400 },
      )
    }

    if (totalAmount < 50) {
      return NextResponse.json({ error: "Importo minimo 0,50 €" }, { status: 400 })
    }

    currency = (currency || "EUR").toLowerCase()
    description = description || "Ordine Shopify via checkout custom"

    const cfg = await getConfig()
    const account = pickStripeAccount(cfg.stripeAccounts)

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Nessun account Stripe configurato. Apri l'onboarding e inserisci almeno una secret key.",
        },
        { status: 400 },
      )
    }

    const stripe = new Stripe(account.secretKey)

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: totalAmount,
            product_data: {
              name: description,
            },
          },
        },
      ],
      success_url: cfg.checkoutDomain
        ? `${cfg.checkoutDomain.replace(/\/$/, "")}/thank-you?session_id={CHECKOUT_SESSION_ID}`
        : "https://google.com",
      cancel_url: cfg.checkoutDomain
        ? `${cfg.checkoutDomain.replace(/\/$/, "")}/cancel?canceled=1`
        : "https://google.com",
    })

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe non ha restituito una URL di checkout" },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error("[payments] Stripe error:", err)
    return NextResponse.json({ error: err.message || "Errore Stripe" }, { status: 500 })
  }
}