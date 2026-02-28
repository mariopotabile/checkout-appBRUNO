// src/app/api/upsell-charge/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      sessionId,
      variantId,
      variantTitle,
      productTitle,
      priceCents,
      image,
      upsellIndex, // ← NUOVO: 1 oppure 2
    } = body

    // upsellIndex default a 1 per retrocompatibilità
    const idx: 1 | 2 = upsellIndex === 2 ? 2 : 1
    const statusKey  = `upsell${idx}Status`        // "upsell1Status" | "upsell2Status"
    const paidAtKey  = `upsell${idx}PaidAt`
    const piKey      = `upsell${idx}PaymentIntentId`
    const amountKey  = `upsell${idx}AmountCents`
    const productKey = `upsell${idx}Product`
    const orderIdKey = `upsell${idx}ShopifyOrderId`
    const orderNumKey= `upsell${idx}ShopifyOrderNumber`
    const errorKey   = `upsell${idx}ShopifyOrderError`

    if (!sessionId || !variantId || !priceCents) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })
    }

    // 1. Carica sessione da Firestore
    const snap = await db.collection(COLLECTION).doc(sessionId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 })
    }
    const sessionData: any = snap.data()

    // 2. Verifica ordine originale pagato
    if (sessionData.paymentStatus !== "paid") {
      return NextResponse.json(
        { error: "Ordine originale non ancora confermato" },
        { status: 400 }
      )
    }

    // 3. Verifica che QUESTO upsell specifico non sia già stato addebitato
    if (sessionData[statusKey] === "paid") {
      return NextResponse.json(
        { error: `Upsell ${idx} già addebitato` },
        { status: 400 }
      )
    }

    const stripeCustomerId    = sessionData.stripeCustomerId
    const stripePaymentMethodId = sessionData.stripePaymentMethodId
    const stripeAccountLabel  = sessionData.stripeAccountUsed

    if (!stripeCustomerId || !stripePaymentMethodId) {
      return NextResponse.json(
        { error: "Metodo di pagamento non disponibile. Il cliente deve reinserire la carta." },
        { status: 400 }
      )
    }

    // 4. Carica account Stripe corretto
    const config = await getConfig()
    const stripeAccounts = config.stripeAccounts || []
    const account =
      stripeAccounts.find((a: any) => a.label === stripeAccountLabel && a.secretKey) ||
      stripeAccounts.find((a: any) => a.secretKey && a.active)

    if (!account) {
      return NextResponse.json({ error: "Account Stripe non trovato" }, { status: 500 })
    }

    const stripe = new Stripe(account.secretKey, { apiVersion: "2025-10-29.clover" as any })

    // 5. Addebito off-session
    console.log(`[upsell-charge] 💳 Upsell ${idx} — €${(priceCents / 100).toFixed(2)}`)
    console.log(`[upsell-charge] Customer: ${stripeCustomerId}`)
    console.log(`[upsell-charge] PaymentMethod: ${stripePaymentMethodId}`)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceCents,
      currency: (sessionData.currency || "EUR").toLowerCase(),
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      confirm: true,
      off_session: true,
      description: productTitle || 'Nimea™',
      metadata: {
        session_id: sessionId,
        order_id: String(sessionData.shopifyOrderId || ""),
        order_number: String(sessionData.shopifyOrderNumber || ""),
        product_title: productTitle || "",
        variant_title: variantTitle || "",
      },
      statement_descriptor_suffix: "NIMEA ORDER".slice(0, 22),
    })

    if (paymentIntent.status !== "succeeded") {
      console.error(`[upsell-charge] ❌ Pagamento fallito: ${paymentIntent.status}`)
      return NextResponse.json(
        { error: "Pagamento non riuscito. Riprova o contatta il supporto." },
        { status: 402 }
      )
    }

    console.log(`[upsell-charge] ✅ Pagamento riuscito: ${paymentIntent.id}`)

    // 6. Crea ordine Shopify separato per questo upsell
    const shopifyDomain = config.shopify?.shopDomain
    const clientId      = config.shopify?.clientId
    const clientSecret  = config.shopify?.clientSecret
    let shopifyUpdated  = false

    if (shopifyDomain && clientId && clientSecret) {
      try {
        const { getShopifyAccessToken } = await import('@/lib/shopifyAuth')
        const adminToken = await getShopifyAccessToken(shopifyDomain, clientId, clientSecret)
        const upsellPriceStr = (priceCents / 100).toFixed(2)
        const customer       = sessionData.customer || {}
        const nameParts      = (customer.fullName || "Cliente").split(" ")
        const firstName      = nameParts[0]
        const lastName       = nameParts.slice(1).join(" ") || "."
        const phoneNumber    = customer.phone || ""

        const upsellOrderPayload = {
          order: {
            email: customer.email || "",
            fulfillment_status: "unfulfilled",
            financial_status: "paid",
            send_receipt: true,
            send_fulfillment_receipt: false,
            note: `UPSELL ${idx} post-acquisto — Ordine originale #${sessionData.shopifyOrderNumber} — Session: ${sessionId}`,
            tags: `upsell,upsell-${idx},checkout-custom,stripe-paid,${stripeAccountLabel}`,

            line_items: [{
              variant_id: parseInt(variantId),
              quantity: 1,
              price: upsellPriceStr,
            }],

            shipping_address: {
              first_name: firstName,
              last_name: lastName,
              address1: customer.address1 || "N/A",
              address2: customer.address2 || "",
              city: customer.city || "N/A",
              province: customer.province || "",
              zip: customer.postalCode || "00000",
              country_code: (customer.countryCode || "IT").toUpperCase(),
              ...(phoneNumber && { phone: phoneNumber }),
            },

            billing_address: {
              first_name: firstName,
              last_name: lastName,
              address1: customer.address1 || "N/A",
              city: customer.city || "N/A",
              zip: customer.postalCode || "00000",
              country_code: (customer.countryCode || "IT").toUpperCase(),
              ...(phoneNumber && { phone: phoneNumber }),
            },

            shipping_lines: [{
              title: "Spedizione inclusa",
              price: "0.00",
              code: "FREE_UPSELL",
            }],

            transactions: [{
              kind: "sale",
              status: "success",
              amount: upsellPriceStr,
              currency: (sessionData.currency || "EUR").toUpperCase(),
              gateway: `Stripe (${stripeAccountLabel})`,
              authorization: paymentIntent.id,
            }],

            ...(customer.email ? { customer: { email: customer.email } } : {}),
          },
        }

        const orderRes  = await fetch(
          `https://${shopifyDomain}/admin/api/2024-10/orders.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": adminToken,
            },
            body: JSON.stringify(upsellOrderPayload),
          }
        )
        const orderData = await orderRes.json()

        if (orderRes.ok && orderData.order?.id) {
          shopifyUpdated = true
          console.log(`[upsell-charge] ✅ Ordine upsell ${idx} Shopify: #${orderData.order.order_number}`)

          await db.collection(COLLECTION).doc(sessionId).update({
            [statusKey]:  "paid",
            [paidAtKey]:  new Date().toISOString(),
            [piKey]:      paymentIntent.id,
            [amountKey]:  priceCents,
            [productKey]: { variantId, variantTitle, productTitle, image },
            [orderIdKey]: orderData.order.id,
            [orderNumKey]:orderData.order.order_number,
          })
        } else {
          console.error(`[upsell-charge] ❌ Errore ordine Shopify upsell ${idx}:`, orderData)
        }
      } catch (shopifyErr: any) {
        console.error(`[upsell-charge] ❌ Errore Shopify upsell ${idx}:`, shopifyErr.message)
      }
    }

    // Salva comunque su Firestore anche se Shopify fallisce
    if (!shopifyUpdated) {
      await db.collection(COLLECTION).doc(sessionId).update({
        [statusKey]:  "paid",
        [paidAtKey]:  new Date().toISOString(),
        [piKey]:      paymentIntent.id,
        [amountKey]:  priceCents,
        [productKey]: { variantId, variantTitle, productTitle, image },
        [errorKey]:   "Ordine Shopify non creato - richiede revisione manuale",
      })
    }

    return NextResponse.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      shopifyUpdated,
    })
  } catch (err: any) {
    console.error("[upsell-charge] 💥 Errore:", err)

    if (err?.type === "StripeCardError" || err?.code === "authentication_required") {
      return NextResponse.json(
        {
          error: "La carta richiede autenticazione aggiuntiva. Impossibile procedere automaticamente.",
          requiresAction: true,
        },
        { status: 402 }
      )
    }

    return NextResponse.json({ error: err.message || "Errore interno" }, { status: 500 })
  }
}