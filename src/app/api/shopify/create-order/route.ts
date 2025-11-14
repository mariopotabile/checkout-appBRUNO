// src/app/api/shopify/create-order/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"
import { getConfig } from "@/lib/config"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId = body.sessionId as string | undefined
    const paymentIntentId = body.paymentIntentId as string | undefined
    const customer = body.customer || {}

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
        { error: "Carrello non trovato" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}
    const items = Array.isArray(data.items) ? data.items : []

    // 2) config Shopify
    const cfg = await getConfig()
    const shopCfg = cfg.shopify || {}
    const shopDomain: string = shopCfg.shopDomain
    const adminToken: string = shopCfg.adminToken
    const apiVersion: string = shopCfg.apiVersion || "2024-10"

    if (!shopDomain || !adminToken) {
      console.error("[/api/shopify/create-order] Shopify non configurato")
      return NextResponse.json(
        { error: "Config Shopify mancante" },
        { status: 500 },
      )
    }

    // 3) line_items per Shopify (usiamo id variante e quantità)
    const line_items = items.map((item: any) => ({
      variant_id: item.id,
      quantity: item.quantity || 1,
    }))

    const orderPayload = {
      order: {
        line_items,
        email: customer.email,
        financial_status: "paid", // PAGATO
        // fulfillment_status: null  // rimane unfulfilled di default
        note: paymentIntentId
          ? `Pagamento Stripe PaymentIntent ${paymentIntentId}`
          : "Pagamento Stripe",
        shipping_address: {
          first_name: customer.firstName,
          last_name: customer.lastName,
          address1: customer.address1,
          address2: customer.address2 || "",
          city: customer.city,
          province: customer.province,
          zip: customer.zip,
          country_code: customer.country || "IT",
          phone: customer.phone || undefined,
        },
      },
    }

    const url = `https://${shopDomain}/admin/api/${apiVersion}/orders.json`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": adminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error("[/api/shopify/create-order] Shopify error:", txt)
      return NextResponse.json(
        { error: "Errore creazione ordine Shopify" },
        { status: 500 },
      )
    }

    const json = await res.json()
    const shopifyOrderId = json?.order?.id

    // salviamo id ordine su cartSession
    await db.collection(COLLECTION).doc(sessionId).set(
      {
        shopifyOrderId,
      },
      { merge: true },
    )

    return NextResponse.json(
      { ok: true, shopifyOrderId },
      { status: 200 },
    )
  } catch (error: any) {
    console.error("[/api/shopify/create-order] errore:", error)
    return NextResponse.json(
      { error: error.message || "Errore interno creazione ordine" },
      { status: 500 },
    )
  }
}