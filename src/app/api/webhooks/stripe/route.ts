// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"
import { getShopifyAccessToken } from "@/lib/shopifyAuth"
import { sendFacebookPurchaseEvent } from "@/lib/facebook-capi"

const COLLECTION = "cartSessions"

function normalizePhoneNumber(phone: string, countryCode: string): string {
  if (!phone) return ""

  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "")

  if (cleaned.startsWith("+")) return cleaned

  const prefixMap: Record<string, string> = {
    IT: "+39", FR: "+33", DE: "+49", ES: "+34", AT: "+43",
    BE: "+32", NL: "+31", CH: "+41", PT: "+351",
    UK: "+44", GB: "+44", US: "+1", CA: "+1",
  }

  const prefix = prefixMap[countryCode.toUpperCase()]
  if (!prefix) return ""

  if (["IT", "FR", "ES", "DE", "AT", "BE", "NL", "PT"].includes(countryCode.toUpperCase())) {
    if (cleaned.startsWith("0")) cleaned = cleaned.substring(1)
  }

  if (cleaned.startsWith(prefix.replace("+", ""))) {
    cleaned = cleaned.substring(prefix.length - 1)
  }

  if (cleaned.length < 8) return ""
  if (!/^\d+$/.test(cleaned)) return ""

  const normalized = prefix + cleaned
  console.log(`[normalizePhone] 📞 ${phone} → ${normalized} (${countryCode})`)
  return normalized
}

export async function POST(req: NextRequest) {
  try {
    console.log("[stripe-webhook] ════════════════════════════════════")
    console.log("[stripe-webhook] 🔔 Webhook ricevuto:", new Date().toISOString())

    const config = await getConfig()

    const stripeAccounts = config.stripeAccounts.filter(
      (a: any) => a.secretKey && a.webhookSecret && a.active
    )

    if (stripeAccounts.length === 0) {
      console.error("[stripe-webhook] ❌ Nessun account Stripe attivo configurato")
      return NextResponse.json({ error: "Config mancante" }, { status: 500 })
    }

    const body = await req.text()
    const signature = req.headers.get("stripe-signature")

    if (!signature) {
      console.error("[stripe-webhook] ❌ Signature mancante")
      return NextResponse.json({ error: "No signature" }, { status: 400 })
    }

    let event: Stripe.Event | null = null
    let matchedAccount: any = null
    let matchedStripe: Stripe | null = null

    for (const account of stripeAccounts) {
      try {
        const stripe = new Stripe(account.secretKey)
        event = stripe.webhooks.constructEvent(body, signature, account.webhookSecret)
        matchedAccount = account
        matchedStripe = stripe
        console.log(`[stripe-webhook] ✅ Signature VALIDA per: ${account.label}`)
        break
      } catch (err: any) {
        continue
      }
    }

    if (!event || !matchedAccount || !matchedStripe) {
      console.error("[stripe-webhook] 💥 NESSUN ACCOUNT HA VALIDATO LA SIGNATURE!")
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
    }

    console.log(`[stripe-webhook] 📨 Evento: ${event.type}`)
    console.log(`[stripe-webhook] 🏦 Account: ${matchedAccount.label}`)

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent

      console.log(`[stripe-webhook] 💳 Payment Intent ID: ${paymentIntent.id}`)
      console.log(`[stripe-webhook] 💰 Importo: €${(paymentIntent.amount / 100).toFixed(2)}`)

      const sessionId =
        paymentIntent.metadata?.sessionId || paymentIntent.metadata?.session_id

      if (!sessionId) {
        console.error("[stripe-webhook] ❌ NESSUN sessionId nei metadata!")
        return NextResponse.json({ received: true, warning: "no_session_id" }, { status: 200 })
      }

      const snap = await db.collection(COLLECTION).doc(sessionId).get()

      if (!snap.exists) {
        console.error(`[stripe-webhook] ❌ Sessione ${sessionId} NON TROVATA`)
        return NextResponse.json({ received: true, error: "session_not_found" }, { status: 200 })
      }

      const sessionData: any = snap.data() || {}

      // ─── Salva customer + payment method ────────────────────────────────────
      const stripeCustomerId = paymentIntent.customer as string | undefined
      const stripePaymentMethodId = paymentIntent.payment_method as string | undefined

      const sessionUpdate: Record<string, any> = {
        paymentStatus: "paid",
        webhookProcessedAt: new Date().toISOString(),
        stripeAccountUsed: matchedAccount.label,
      }

      if (stripeCustomerId)      sessionUpdate.stripeCustomerId = stripeCustomerId
      if (stripePaymentMethodId) sessionUpdate.stripePaymentMethodId = stripePaymentMethodId

      // ─── Attacca PM al customer + salva network_transaction_id MIT ──────────
      if (stripeCustomerId && stripePaymentMethodId) {
        try {
          await matchedStripe.paymentMethods.attach(stripePaymentMethodId, {
            customer: stripeCustomerId,
          })
          await matchedStripe.customers.update(stripeCustomerId, {
            invoice_settings: { default_payment_method: stripePaymentMethodId },
          })
          console.log(`[stripe-webhook] ✅ PM attaccato al customer: ${stripeCustomerId}`)
        } catch (e: any) {
          if (!e.message?.includes("already been attached")) {
            console.error("[stripe-webhook] ⚠️ attach PM error:", e.message)
          }
        }

        // Recupera network_transaction_id per esenzione MIT upsell
        try {
          if (paymentIntent.latest_charge) {
            const charge = await matchedStripe.charges.retrieve(
              paymentIntent.latest_charge as string
            )
            const networkTxId =
              charge?.payment_method_details?.card?.network_transaction_id

            if (networkTxId) {
              sessionUpdate.networkTransactionId = networkTxId
              console.log(`[stripe-webhook] ✅ network_transaction_id salvato: ${networkTxId}`)
            }
          }
        } catch (e: any) {
          console.log("[stripe-webhook] ⚠️ network_transaction_id non disponibile:", e.message)
        }
      }

      await db.collection(COLLECTION).doc(sessionId).update(sessionUpdate)

      // ─── Evita doppia creazione ordine ──────────────────────────────────────
      if (sessionData.shopifyOrderId) {
        console.log(`[stripe-webhook] ℹ️ Ordine già esistente: #${sessionData.shopifyOrderNumber}`)
        return NextResponse.json({ received: true, alreadyProcessed: true }, { status: 200 })
      }

      console.log("[stripe-webhook] 🚀 CREAZIONE ORDINE SHOPIFY...")

      const result = await createShopifyOrder({
        sessionId,
        sessionData,
        paymentIntent,
        config,
        stripeAccountLabel: matchedAccount.label,
      })

      if (result.orderId) {
        console.log(`[stripe-webhook] 🎉 Ordine creato: #${result.orderNumber}`)

        await db.collection(COLLECTION).doc(sessionId).update({
          shopifyOrderId: result.orderId,
          shopifyOrderNumber: result.orderNumber,
          orderCreatedAt: new Date().toISOString(),
        })

        // Statistiche giornaliere
        const today = new Date().toISOString().split("T")[0]
        const statsRef = db.collection("dailyStats").doc(today)

        await db.runTransaction(async (transaction) => {
          const statsDoc = await transaction.get(statsRef)

          if (!statsDoc.exists) {
            transaction.set(statsRef, {
              date: today,
              accounts: {
                [matchedAccount.label]: {
                  totalCents: paymentIntent.amount,
                  transactionCount: 1,
                },
              },
              totalCents: paymentIntent.amount,
              totalTransactions: 1,
            })
          } else {
            const data = statsDoc.data()!
            const accountStats = data.accounts?.[matchedAccount.label] || {
              totalCents: 0,
              transactionCount: 0,
            }

            transaction.update(statsRef, {
              [`accounts.${matchedAccount.label}.totalCents`]:
                accountStats.totalCents + paymentIntent.amount,
              [`accounts.${matchedAccount.label}.transactionCount`]:
                accountStats.transactionCount + 1,
              totalCents: (data.totalCents || 0) + paymentIntent.amount,
              totalTransactions: (data.totalTransactions || 0) + 1,
            })
          }
        })

        console.log("[stripe-webhook] 💾 Statistiche aggiornate")

        // Facebook CAPI
        await sendMetaPurchaseEvent({ paymentIntent, sessionData, sessionId, req })

        // Clear cart
        if (sessionData.rawCart?.id) {
          await clearShopifyCart(sessionData.rawCart.id, config)
        }

        console.log("[stripe-webhook] ✅ COMPLETATO CON SUCCESSO")
        return NextResponse.json(
          { received: true, orderId: result.orderId, orderNumber: result.orderNumber },
          { status: 200 }
        )
      } else {
        console.error("[stripe-webhook] ❌ Creazione ordine FALLITA")
        return NextResponse.json({ received: true, error: "order_creation_failed" }, { status: 200 })
      }
    }

    console.log(`[stripe-webhook] ℹ️ Evento ${event.type} ignorato`)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error("[stripe-webhook] 💥 ERRORE CRITICO:", error.message)
    return NextResponse.json({ error: error?.message }, { status: 500 })
  }
}

// ─── Facebook CAPI ───────────────────────────────────────────────────────────
async function sendMetaPurchaseEvent({
  paymentIntent,
  sessionData,
  sessionId,
  req,
}: {
  paymentIntent: any
  sessionData: any
  sessionId: string
  req: NextRequest
}) {
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID
  const accessToken = process.env.FB_CAPI_ACCESS_TOKEN

  if (!pixelId || !accessToken) {
    console.log("[stripe-webhook] ⚠️ Meta Pixel non configurato (skip CAPI)")
    return
  }

  try {
    const customer = sessionData.customer || {}
    const attributes = sessionData.rawCart?.attributes || {}

    const nameParts = (customer.fullName || "").trim().split(/\s+/)
    const firstName = nameParts[0] || ""
    const lastName = nameParts.slice(1).join(" ") || ""

    const phoneNormalized = normalizePhoneNumber(
      customer.phone || "",
      customer.countryCode || "IT"
    )

    const fbc = attributes._wt_last_fbclid
      ? `fb.1.${Date.now()}.${attributes._wt_last_fbclid}`
      : undefined

    const result = await sendFacebookPurchaseEvent({
      email: customer.email || "",
      phone: phoneNormalized,
      firstName,
      lastName,
      city: customer.city || "",
      postalCode: customer.postalCode || "",
      country: customer.countryCode || "IT",
      orderValue: paymentIntent.amount,
      currency: (paymentIntent.currency || "EUR").toUpperCase(),
      orderItems: (sessionData.items || []).map((item: any) => ({
        id: String(item.id),
        quantity: item.quantity || 1,
      })),
      eventId: paymentIntent.id,
      eventSourceUrl: `https://oltreboutique.com${attributes._wt_last_landing || "/"}`,
      clientIp:
        req.headers.get("x-forwarded-for")?.split(",")[0] ||
        req.headers.get("x-real-ip") ||
        "0.0.0.0",
      userAgent: req.headers.get("user-agent") || "",
      fbp: attributes._fbp,
      fbc,
      utm: {
        source: attributes._wt_last_source,
        medium: attributes._wt_last_medium,
        campaign: attributes._wt_last_campaign,
        content: attributes._wt_last_content,
        term: attributes._wt_last_term,
      },
      utmFirst: {
        source: attributes._wt_first_source,
        medium: attributes._wt_first_medium,
        campaign: attributes._wt_first_campaign,
        content: attributes._wt_first_content,
        term: attributes._wt_first_term,
      },
    })

    if (result.success) {
      console.log("[stripe-webhook] ✅ Meta CAPI Purchase inviato")
    } else {
      console.error("[stripe-webhook] ❌ Errore Meta CAPI:", result.error)
    }
  } catch (error: any) {
    console.error("[stripe-webhook] ⚠️ Errore invio Meta CAPI:", error.message)
  }
}

// ─── Crea ordine Shopify ─────────────────────────────────────────────────────
async function createShopifyOrder({
  sessionId,
  sessionData,
  paymentIntent,
  config,
  stripeAccountLabel,
}: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const clientId = config.shopify?.clientId
    const clientSecret = config.shopify?.clientSecret

    if (!shopifyDomain || !clientId || !clientSecret) {
      console.error("[createShopifyOrder] ❌ Config Shopify OAuth mancante")
      return { orderId: null, orderNumber: null }
    }

    let adminToken: string
    try {
      adminToken = await getShopifyAccessToken(shopifyDomain, clientId, clientSecret)
    } catch (err: any) {
      console.error("[createShopifyOrder] ❌ Errore token OAuth:", err.message)
      return { orderId: null, orderNumber: null }
    }

    const customer = sessionData.customer || {}
    const items = sessionData.items || []

    if (items.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun prodotto nel carrello")
      return { orderId: null, orderNumber: null }
    }

    const phoneNumber = normalizePhoneNumber(customer.phone || "", customer.countryCode || "IT")
    const hasValidPhone = phoneNumber.length > 0

    const lineItems = items
      .map((item: any, index: number) => {
        let variantId = item.variant_id || item.id

        if (typeof variantId === "string") {
          if (variantId.includes("gid://")) variantId = variantId.split("/").pop()
          variantId = variantId.replace(/\D/g, "")
        }

        const variantIdNum = parseInt(variantId)
        if (isNaN(variantIdNum) || variantIdNum <= 0) return null

        const quantity = item.quantity || 1
        const price = ((item.linePriceCents || item.priceCents * quantity || 0) / 100).toFixed(2)

        return { variant_id: variantIdNum, quantity, price }
      })
      .filter((item: any) => item !== null)

    if (lineItems.length === 0) {
      console.error("[createShopifyOrder] ❌ Nessun line item valido")
      return { orderId: null, orderNumber: null }
    }

    const totalAmount = (paymentIntent.amount / 100).toFixed(2)
    const nameParts = (customer.fullName || "Cliente Checkout").trim().split(/\s+/)
    const firstName = nameParts[0] || "Cliente"
    const lastName = nameParts.slice(1).join(" ") || "Checkout"

    const customerData: any = {
      email: customer.email || "noreply@oltreboutique.com",
      first_name: firstName,
      last_name: lastName,
    }
    if (hasValidPhone) customerData.phone = phoneNumber

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
    if (hasValidPhone) addressData.phone = phoneNumber

    const orderPayload = {
      order: {
        email: customer.email || "noreply@oltreboutique.com",
        fulfillment_status: "unfulfilled",
        financial_status: "paid",
        send_receipt: true,
        send_fulfillment_receipt: false,
        line_items: lineItems,
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
            currency: (paymentIntent.currency || "EUR").toUpperCase(),
            gateway: `Stripe (${stripeAccountLabel})`,
            authorization: paymentIntent.id,
          },
        ],
        note: `Checkout custom - Session: ${sessionId} - Stripe Account: ${stripeAccountLabel} - PI: ${paymentIntent.id}`,
        tags: `checkout-custom,stripe-paid,${stripeAccountLabel},automated`,
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
      console.error("[createShopifyOrder] ❌ ERRORE API Shopify:", response.status, responseText)
      return { orderId: null, orderNumber: null }
    }

    const result = JSON.parse(responseText)

    if (result.order?.id) {
      console.log(`[createShopifyOrder] 🎉 #${result.order.order_number} (ID: ${result.order.id})`)
      return { orderId: result.order.id, orderNumber: result.order.order_number }
    }

    return { orderId: null, orderNumber: null }
  } catch (error: any) {
    console.error("[createShopifyOrder] 💥 ERRORE:", error.message)
    return { orderId: null, orderNumber: null }
  }
}

// ─── Clear cart Shopify ──────────────────────────────────────────────────────
async function clearShopifyCart(cartId: string, config: any) {
  try {
    const shopifyDomain = config.shopify?.shopDomain
    const storefrontToken = config.shopify?.storefrontToken

    if (!shopifyDomain || !storefrontToken) return

    const cartResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: `query getCart($cartId: ID!) { cart(id: $cartId) { lines(first: 100) { edges { node { id } } } } }`,
          variables: { cartId },
        }),
      }
    )

    const cartData = await cartResponse.json()
    if (cartData.errors) return

    const lineIds =
      cartData.data?.cart?.lines?.edges?.map((edge: any) => edge.node.id) || []

    if (lineIds.length === 0) return

    const removeResponse = await fetch(
      `https://${shopifyDomain}/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontToken,
        },
        body: JSON.stringify({
          query: `mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { id totalQuantity } userErrors { field message } } }`,
          variables: { cartId, lineIds },
        }),
      }
    )

    const removeData = await removeResponse.json()

    if (removeData.data?.cartLinesRemove?.userErrors?.length > 0) {
      console.error("[clearShopifyCart] ❌ Errori:", removeData.data.cartLinesRemove.userErrors)
    } else {
      console.log("[clearShopifyCart] ✅ Carrello svuotato")
    }
  } catch (error: any) {
    console.error("[clearShopifyCart] ❌ Errore:", error.message)
  }
}

