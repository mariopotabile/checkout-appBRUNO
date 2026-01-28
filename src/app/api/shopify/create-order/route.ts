// src/app/api/shopify/create-order/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"
import { getShopifyAccessToken } from "@/lib/shopifyAuth" // ✅ NUOVO IMPORT

type CustomerPayload = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  province: string
  zip: string
  country: string
}

const CHECKOUT_SESSIONS_COLLECTION = "checkoutSessions"
const FIXED_SHIPPING = 5.9 // EUR, come nel checkout esterno

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)

    const sessionId = body?.sessionId as string | undefined
    const paymentIntentId = body?.paymentIntentId as string | undefined
    const customer = body?.customer as CustomerPayload | undefined

    if (!sessionId || !paymentIntentId || !customer) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Parametri mancanti. Servono sessionId, paymentIntentId e customer.",
        },
        { status: 400 },
      )
    }

    // 1) Config da Firestore (Shopify)
    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain
    const clientId = cfg.shopify?.clientId       // ✅ NUOVO
    const clientSecret = cfg.shopify?.clientSecret // ✅ NUOVO
    const apiVersion = cfg.shopify?.apiVersion || "2024-10"

    if (!shopDomain || !clientId || !clientSecret) {
      console.error(
        "[create-order] ❌ Config Shopify mancante. shopDomain/clientId/clientSecret vuoti.",
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Configurazione Shopify mancante. Completa l'onboarding con dominio, Client ID e Client Secret.",
        },
        { status: 500 },
      )
    }

    // ✅ NUOVO: Ottieni token Admin API con OAuth (auto-refresh)
    let adminToken: string
    try {
      adminToken = await getShopifyAccessToken(shopDomain, clientId, clientSecret)
      console.log('[create-order] ✅ Token Admin ottenuto')
    } catch (err: any) {
      console.error('[create-order] ❌ Errore ottenimento token:', err.message)
      return NextResponse.json(
        {
          ok: false,
          error: "Impossibile ottenere token Shopify. Verifica Client ID e Secret.",
        },
        { status: 500 },
      )
    }

    // 2) Recupera la sessione di checkout da Firestore
    const ref = db
      .collection(CHECKOUT_SESSIONS_COLLECTION)
      .doc(String(sessionId))
    const snap = await ref.get()

    if (!snap.exists) {
      console.error(
        "[create-order] Nessuna sessione trovata per sessionId:",
        sessionId,
      )
      return NextResponse.json(
        { ok: false, error: "Sessione di checkout non trovata." },
        { status: 404 },
      )
    }

    const sessionData = snap.data() || {}
    const currency = (sessionData.currency as string | undefined) || "EUR"

    const rawCart = sessionData.rawCart || {}
    const rawItems: any[] = Array.isArray(rawCart.items)
      ? rawCart.items
      : Array.isArray(sessionData.items)
      ? sessionData.items
      : []

    if (!rawItems.length) {
      console.error(
        "[create-order] Nessun item nella sessione per sessionId:",
        sessionId,
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nessun articolo nel carrello per questa sessione. Impossibile creare ordine.",
        },
        { status: 400 },
      )
    }

    // 3) Costruiamo le line_items con prezzo "finale" (già scontato)
    const line_items = rawItems.map((item) => {
      const variantId =
        item.variant_id ?? item.id ?? item.product_id ?? undefined
      const quantity = Number(item.quantity || 1)

      const finalLineCents =
        typeof item.final_line_price === "number"
          ? item.final_line_price
          : typeof item.discounted_price === "number"
          ? item.discounted_price * quantity
          : typeof item.linePriceCents === "number"
          ? item.linePriceCents
          : typeof item.priceCents === "number"
          ? item.priceCents * quantity
          : 0

      const unitFinal = quantity > 0 ? finalLineCents / 100 / quantity : 0

      return {
        variant_id: variantId,
        quantity,
        price: unitFinal.toFixed(2),
      }
    })

    // 4) Shipping: usiamo 5,90 fissi come nel checkout esterno
    const shipping_lines =
      FIXED_SHIPPING > 0
        ? [
            {
              title: "Spedizione Standard 24/48h",
              price: FIXED_SHIPPING.toFixed(2),
              code: "STANDARD",
              source: "checkout-app",
            },
          ]
        : []

    // 5) Indirizzi da payload customer
    const shipping_address = {
      first_name: customer.firstName || "",
      last_name: customer.lastName || "",
      address1: customer.address1 || "",
      address2: customer.address2 || "",
      phone: customer.phone || "",
      city: customer.city || "",
      province: customer.province || "",
      country: customer.country || "Italy",
      zip: customer.zip || "",
    }

    const billing_address = {
      ...shipping_address,
    }

    // 6) Payload ordine per Shopify
    const orderPayload = {
      order: {
        line_items,
        shipping_lines,
        email: customer.email || undefined,
        currency,
        financial_status: "paid",
        send_receipt: false,
        send_fulfillment_receipt: false,
        tags: "CHECKOUT_APP, EXTERNAL_CHECKOUT",
        note: `Ordine creato dal checkout esterno. PaymentIntent: ${paymentIntentId}`,
        shipping_address,
        billing_address,
      },
    }

    // 7) Chiamata a Shopify (con token fresco)
    const url = `https://${shopDomain}/admin/api/${apiVersion}/orders.json`

    const shopifyRes = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken, // ✅ USA TOKEN FRESCO
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(orderPayload),
    })

    if (!shopifyRes.ok) {
      const txt = await shopifyRes.text()
      console.error(
        "[create-order] ❌ Errore Shopify:",
        shopifyRes.status,
        txt,
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Errore nella creazione dell'ordine su Shopify. Controlla i log.",
          details: txt,
        },
        { status: 500 },
      )
    }

    const shopifyJson = await shopifyRes.json()
    const order = shopifyJson.order

    // 8) Salviamo in Firestore l'id ordine creato
    await ref.set(
      {
        shopifyOrderId: order?.id,
        shopifyOrderName: order?.name,
        createdOrderAt: new Date().toISOString(),
      },
      { merge: true },
    )

    console.log('[create-order] ✅ Ordine creato su Shopify:', order?.name)

    return NextResponse.json(
      {
        ok: true,
        orderId: order?.id,
        orderName: order?.name,
        orderNumber: order?.order_number,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[create-order] ❌ Errore generale:", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Errore interno nella creazione dell'ordine Shopify.",
      },
      { status: 500 },
    )
  }
}