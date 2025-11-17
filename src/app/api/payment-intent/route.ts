// src/app/api/payment-intent/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = body?.sessionId as string | undefined

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

    const data: any = snap.data() || {}

    // Se abbiamo già un PaymentIntent salvato, riusa quello
    if (data.paymentIntentClientSecret) {
      return NextResponse.json(
        { clientSecret: data.paymentIntentClientSecret },
        { status: 200 },
      )
    }

    const currency = (data.currency || "EUR").toString().toLowerCase()

    // -------------------------------
    // 2) Calcolo importo in modo robusto
    // -------------------------------

    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : 0

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalFromSession =
      typeof data.totalCents === "number" ? data.totalCents : 0

    const rawCart = data.rawCart || {}
    const totalFromRawCart =
      typeof rawCart.total_price === "number" ? rawCart.total_price : 0

    let amountCents = 0

    if (totalFromSession > 0) {
      amountCents = totalFromSession
    } else if (totalFromRawCart > 0) {
      amountCents = totalFromRawCart
    } else {
      amountCents = subtotalCents + shippingCents
    }

    if (!amountCents || amountCents < 50) {
      console.warn("[/api/payment-intent] amountCents non valido:", {
        subtotalCents,
        shippingCents,
        totalFromSession,
        totalFromRawCart,
        amountCents,
      })

      return NextResponse.json(
        {
          error:
            "Importo non valido. Verifica il totale ordine prima di procedere al pagamento.",
        },
        { status: 400 },
      )
    }

    // -------------------------------
    // 3) Prende la secret di Stripe + merchantSite da Firebase config
    // -------------------------------
    const cfg = await getConfig()

    const stripeAccounts = Array.isArray(cfg.stripeAccounts)
      ? cfg.stripeAccounts.filter((a: any) => a.secretKey)
      : []

    const firstStripe = stripeAccounts[0] || null

    const secretKey =
      firstStripe?.secretKey || process.env.STRIPE_SECRET_KEY || ""

    if (!secretKey) {
      console.error(
        "[/api/payment-intent] Nessuna Stripe secret key configurata",
      )
      return NextResponse.json(
        { error: "Configurazione Stripe mancante" },
        { status: 500 },
      )
    }

    const merchantSite: string =
      (firstStripe as any)?.merchantSite ||
      cfg.checkoutDomain ||
      "https://notforresale.it"

    const descriptorRaw = (firstStripe as any)?.label || "NFR"
    const statementDescriptorSuffix =
      descriptorRaw.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 22) || "NFR"

    // ✅ niente apiVersion esplicita → usa quella di account/dashboard
    const stripe = new Stripe(secretKey)

    // -------------------------------
    // 4) Crea PaymentIntent SOLO CARTA, con metadata utili
    // -------------------------------
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      payment_method_types: ["card"],
      metadata: {
        sessionId,
        merchant_site: merchantSite,
        first_item_title:
          Array.isArray(data.items) && data.items[0]?.title
            ? String(data.items[0].title)
            : "",
      },
      statement_descriptor_suffix: statementDescriptorSuffix,
    })

    // -------------------------------
    // 5) Salva info del PaymentIntent dentro alla sessione carrello
    // -------------------------------
    await db.collection(COLLECTION).doc(sessionId).update({
      paymentIntentId: paymentIntent.id,
      paymentIntentClientSecret: paymentIntent.client_secret,
      stripeAccountLabel: firstStripe?.label || null,
    })

    return NextResponse.json(
      { clientSecret: paymentIntent.client_secret },
      { status: 200 },
    )
  } catch (error: any) {
    console.error("[/api/payment-intent] errore:", error)
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Errore interno nella creazione del pagamento",
      },
      { status: 500 },
    )
  }
}