// src/app/api/upsell/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getActiveStripeAccount } from "@/lib/stripeRotation"
import { getConfig } from "@/lib/config"
import { getShopifyAccessToken } from "@/lib/shopifyAuth"

const COLLECTION = "cartSessions"

type UpsellBody = {
  sessionId?: string
  variantId?: number | string
  quantity?: number
  upsellAmountCents?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as UpsellBody | null

    const sessionId = body?.sessionId
    const variantIdRaw = body?.variantId
    const quantity = body?.quantity ?? 1
    const upsellAmountCents = body?.upsellAmountCents

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId mancante" },
        { status: 400 }
      )
    }

    if (!variantIdRaw) {
      return NextResponse.json(
        { success: false, error: "variantId mancante" },
        { status: 400 }
      )
    }

    if (!upsellAmountCents || upsellAmountCents < 50) {
      return NextResponse.json(
        { success: false, error: "Importo upsell non valido (minimo 50 centesimi)" },
        { status: 400 }
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { success: false, error: "Sessione non trovata" },
        { status: 404 }
      )
    }

    const sessionData: any = snap.data() || {}
    const currency = (sessionData.currency || "EUR").toString().toLowerCase()

    const activeAccount = await getActiveStripeAccount()
    const stripe = new Stripe(activeAccount.secretKey, {
      apiVersion: "2025-10-29.clover",
    })

    // ─── Recupero payment method + customer ──────────────────────────────────
    const stripePaymentMethodId = sessionData.stripePaymentMethodId as string | undefined
    let stripeCustomerId = sessionData.stripeCustomerId as string | undefined

    if (!stripePaymentMethodId) {
      return NextResponse.json(
        { success: false, error: "Nessun metodo di pagamento salvato per upsell" },
        { status: 400 }
      )
    }

    if (!stripeCustomerId) {
      try {
        console.log("[upsell] 🔍 Recupero customer dal payment method:", stripePaymentMethodId)
        const pm = await stripe.paymentMethods.retrieve(stripePaymentMethodId)

        if (pm.customer) {
          stripeCustomerId = pm.customer as string
          console.log("[upsell] ✅ Customer trovato:", stripeCustomerId)
          await db.collection(COLLECTION).doc(sessionId).update({ stripeCustomerId })
        } else {
          console.log("[upsell] ⚠️ Payment method senza customer associato")
        }
      } catch (err: any) {
        console.error("[upsell] ❌ Errore recupero payment method:", err.message)
      }
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Nessun customer associato al metodo di pagamento per upsell.",
        },
        { status: 400 }
      )
    }

    // ─── Normalizza variantId ─────────────────────────────────────────────────
    let variantId = variantIdRaw
    if (typeof variantId === "string") {
      if (variantId.includes("gid://")) variantId = variantId.split("/").pop() as string
      variantId = (variantId as string).replace(/\D/g, "")
    }
    const variantIdNum = parseInt(String(variantId), 10)
    if (isNaN(variantIdNum) || variantIdNum <= 0) {
      return NextResponse.json(
        { success: false, error: "variantId non valido" },
        { status: 400 }
      )
    }

    // ─── 1) PaymentIntent upsell con MIT ─────────────────────────────────────
    const description = `Upsell - Session ${sessionId} - Variant ${variantIdNum}`

    const networkTransactionId = sessionData.networkTransactionId as string | undefined
    if (networkTransactionId) {
      console.log(`[upsell] 🔑 MIT con network_transaction_id: ${networkTransactionId}`)
    } else {
      console.log("[upsell] ⚠️ network_transaction_id non disponibile, upsell senza MIT")
    }

    // ✅ FIX: network_transaction_id va dentro card direttamente,
    // NON dentro mit_exemption (parametro non supportato da Stripe)
    const cardOptions: Stripe.PaymentIntentCreateParams.PaymentMethodOptions.Card = {
      request_three_d_secure: "automatic",
      ...(networkTransactionId && {
        network_transaction_id: networkTransactionId,
      }),
    }

    let upsellPaymentIntent: Stripe.PaymentIntent

    try {
      upsellPaymentIntent = await stripe.paymentIntents.create({
        amount: upsellAmountCents,
        currency,
        customer: stripeCustomerId,
        payment_method: stripePaymentMethodId,
        off_session: true,
        confirm: true,
        description,
        payment_method_options: {
          card: cardOptions,
        },
        metadata: {
          session_id: sessionId,
          upsell: "true",
          upsell_variant_id: String(variantIdNum),
          upsell_quantity: String(quantity),
        },
      })
    } catch (err: any) {
      if (err?.code === "authentication_required") {
        console.log("[upsell] ⚠️ 3DS richiesto dalla banca")
        return NextResponse.json(
          {
            success: false,
            requiresAction: true,
            paymentIntentId: err?.raw?.payment_intent?.id,
            clientSecret: err?.raw?.payment_intent?.client_secret,
            message: "La banca richiede una nuova autenticazione (3DS) per l'upsell.",
          },
          { status: 402 }
        )
      }

      const cardErrors = [
        "incorrect_cvc",
        "card_declined",
        "expired_card",
        "insufficient_funds",
        "incorrect_number",
        "card_velocity_exceeded",
        "do_not_honor",
      ]

      if (cardErrors.includes(err?.code)) {
        console.log(`[upsell] ℹ️ Carta rifiutata (${err.code}) per sessione ${sessionId}`)

        await db.collection(COLLECTION).doc(sessionId).update({
          upsellStatus: "card_declined",
          upsellDeclineCode: err?.decline_code || err?.code,
          upsellError: err?.message,
          upsellAttemptedAt: new Date().toISOString(),
        })

        return NextResponse.json(
          {
            success: false,
            error: "Il pagamento upsell è stato rifiutato dalla banca.",
            declineCode: err?.decline_code || err?.code,
          },
          { status: 402 }
        )
      }

      console.error("[upsell] ❌ Errore PaymentIntent upsell:", err)
      return NextResponse.json(
        {
          success: false,
          error: err?.message || "Errore nella creazione del pagamento upsell.",
        },
        { status: 500 }
      )
    }

    if (upsellPaymentIntent.status !== "succeeded") {
      return NextResponse.json(
        {
          success: false,
          error: `Pagamento upsell non riuscito (status: ${upsellPaymentIntent.status})`,
        },
        { status: 400 }
      )
    }

    console.log(`[upsell] ✅ Pagamento upsell confermato: ${upsellPaymentIntent.id}`)

    // ─── 2) Crea ordine Shopify per upsell ───────────────────────────────────
    const config = await getConfig()
    const shopifyDomain = config.shopify?.shopDomain
    const clientId = config.shopify?.clientId
    const clientSecret = config.shopify?.clientSecret

    if (!shopifyDomain || !clientId || !clientSecret) {
      console.error("[upsell] ❌ Config Shopify OAuth mancante")

      await db.collection(COLLECTION).doc(sessionId).update({
        upsellPaymentIntentId: upsellPaymentIntent.id,
        upsellAmountCents,
        upsellStatus: "paid_no_shopify_order",
        upsellError: "Shopify config missing",
        upsellCreatedAt: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          success: true,
          warning: "upsell_paid_but_no_shopify_order",
          message: "Pagamento upsell riuscito, ma ordine Shopify non creato.",
        },
        { status: 200 }
      )
    }

    let adminToken: string
    try {
      adminToken = await getShopifyAccessToken(shopifyDomain, clientId, clientSecret)
    } catch (err: any) {
      console.error("[upsell] ❌ Errore token OAuth Shopify:", err?.message)

      await db.collection(COLLECTION).doc(sessionId).update({
        upsellPaymentIntentId: upsellPaymentIntent.id,
        upsellAmountCents,
        upsellStatus: "paid_no_shopify_order",
        upsellError: "Shopify OAuth error",
        upsellCreatedAt: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          success: true,
          warning: "upsell_paid_but_no_shopify_order",
          message: "Pagamento upsell riuscito, ma ordine Shopify non creato.",
        },
        { status: 200 }
      )
    }

    const customer = sessionData.customer || {}
    const nameParts = (customer.fullName || "Cliente Upsell").trim().split(/\s+/)
    const firstName = nameParts[0] || "Cliente"
    const lastName = nameParts.slice(1).join(" ") || "Upsell"
    const phone = customer.phone || ""
    const hasValidPhone = !!phone

    const customerData: any = {
      email: customer.email || "noreply@oltreboutique.com",
      first_name: firstName,
      last_name: lastName,
    }
    if (hasValidPhone) customerData.phone = phone

    const addressData: any = {
      first_name: firstName,
      last_name: lastName,
      address1: customer.address1 || "N/A",
      address2: customer.address2 || "",
      city: customer.city || "N/A",
      province: customer.province || "",
      zip: customer.postalCode || "00000",
      country_code: (customer.countryCode || "IT").toUpperCase(),
    }
    if (hasValidPhone) addressData.phone = phone

    const totalAmount = (upsellPaymentIntent.amount / 100).toFixed(2)

    const orderPayload = {
      order: {
        email: customer.email || "noreply@oltreboutique.com",
        fulfillment_status: "unfulfilled",
        financial_status: "paid",
        send_receipt: true,
        send_fulfillment_receipt: false,
        line_items: [
          {
            variant_id: variantIdNum,
            quantity,
          },
        ],
        customer: customerData,
        shipping_address: addressData,
        billing_address: addressData,
        shipping_lines: [
          { title: "Spedizione Gratuita", price: "0.00", code: "FREE" },
        ],
        transactions: [
          {
            kind: "sale",
            status: "success",
            amount: totalAmount,
            currency: (upsellPaymentIntent.currency || currency).toUpperCase(),
            gateway: `Stripe Upsell (${activeAccount.label})`,
            authorization: upsellPaymentIntent.id,
          },
        ],
        note: `Upsell order - Session: ${sessionId} - PI: ${upsellPaymentIntent.id}`,
        tags: `checkout-custom-upsell,stripe-upsell,${activeAccount.label},automated`,
      },
    }

    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify(orderPayload),
      }
    )

    const responseText = await response.text()

    if (!response.ok) {
      console.error("[upsell] ❌ ERRORE API Shopify:", response.status, responseText)

      await db.collection(COLLECTION).doc(sessionId).update({
        upsellPaymentIntentId: upsellPaymentIntent.id,
        upsellAmountCents,
        upsellStatus: "paid_no_shopify_order",
        upsellError: `Shopify error ${response.status}`,
        upsellCreatedAt: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          success: true,
          warning: "upsell_paid_but_no_shopify_order",
          message: "Pagamento upsell riuscito, ma creazione ordine Shopify fallita.",
        },
        { status: 200 }
      )
    }

    const shopifyResult = JSON.parse(responseText)
    const upsellOrderId = shopifyResult.order?.id
    const upsellOrderNumber = shopifyResult.order?.order_number

    console.log(`[upsell] 🎉 Ordine Shopify upsell creato: #${upsellOrderNumber}`)

    await db.collection(COLLECTION).doc(sessionId).update({
      upsellPaymentIntentId: upsellPaymentIntent.id,
      upsellAmountCents,
      upsellOrderId,
      upsellOrderNumber,
      upsellStatus: "paid",
      upsellCreatedAt: new Date().toISOString(),
    })

    return NextResponse.json(
      { success: true, orderId: upsellOrderId, orderNumber: upsellOrderNumber },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[upsell] 💥 ERRORE CRITICO:", error?.message)
    return NextResponse.json(
      { success: false, error: error?.message || "Errore interno upsell" },
      { status: 500 }
    )
  }
}
