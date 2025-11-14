// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { db } from "@/lib/firebaseAdmin"

type ShopifyCartItem = {
  id: number | string
  title: string
  quantity: number
  price: number // centesimi (prezzo unitario "di listino")
  line_price?: number // totale riga (spesso già scontato)
  discounted_price?: number // prezzo unitario scontato
  final_line_price?: number // totale riga finale (dopo sconto)
  total_discount?: number // sconto totale di riga
  image?: string
  featured_image?: { url?: string }
  variant_title?: string
}

type ShopifyCart = {
  items?: ShopifyCartItem[]
  items_subtotal_price?: number
  original_total_price?: number
  total_discount?: number
  total_price?: number
  currency?: string
  discount_codes?: { code: string }[]
}

type CheckoutItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  // tutti in centesimi
  priceCents: number // prezzo unitario effettivo (scontato)
  linePriceCents: number // totale riga effettivo
  originalPriceCents: number // prezzo unitario pieno
  discountedPriceCents: number // prezzo unitario scontato
  lineDiscountCents: number // sconto totale su quella riga
  image?: string
}

const COLLECTION = "cartSessions"

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  })
}

/**
 * POST /api/cart-session
 * Body: { cart: <dati /cart.js> }
 */
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const body = await req.json().catch(() => null)

    if (!body || !body.cart) {
      return new NextResponse(
        JSON.stringify({ error: "Body non valido o cart mancante" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const cart: ShopifyCart = body.cart
    const currency = (cart.currency || "EUR").toString().toUpperCase()

    const items: CheckoutItem[] = Array.isArray(cart.items)
      ? cart.items.map((item) => {
          const qty = Number(item.quantity || 0)

          const originalPriceCents =
            typeof item.price === "number" ? item.price : 0

          const discountedPriceCents =
            typeof item.discounted_price === "number"
              ? item.discounted_price
              : originalPriceCents

          const linePriceCents =
            typeof item.final_line_price === "number"
              ? item.final_line_price
              : typeof item.line_price === "number"
              ? item.line_price
              : discountedPriceCents * qty

          const lineDiscountCents =
            typeof item.total_discount === "number" ? item.total_discount : 0

          const image =
            item.image || item.featured_image?.url || undefined

          return {
            id: item.id,
            title: item.title,
            variantTitle: item.variant_title || "",
            quantity: qty,
            priceCents: discountedPriceCents,
            linePriceCents,
            originalPriceCents,
            discountedPriceCents,
            lineDiscountCents,
            image,
          }
        })
      : []

    // Subtotale: usiamo il totale già scontato di Shopify
    const subtotalCents =
      typeof cart.total_price === "number"
        ? cart.total_price
        : typeof cart.items_subtotal_price === "number"
        ? cart.items_subtotal_price
        : items.reduce((sum, it) => sum + it.linePriceCents, 0)

    const discountTotalCents =
      typeof cart.total_discount === "number" ? cart.total_discount : 0

    const couponCodes =
      Array.isArray(cart.discount_codes) && cart.discount_codes.length > 0
        ? cart.discount_codes.map((d) => d.code)
        : []

    const sessionId = randomUUID()

    const doc = {
      sessionId,
      createdAt: new Date().toISOString(),
      currency,
      items,
      subtotalCents,
      shippingCents: 0,
      totalCents: subtotalCents, // per ora niente spedizione
      discountTotalCents,
      couponCodes,
      totals: {
        subtotal: subtotalCents,
        currency,
      },
      rawCart: cart,
    }

    await db.collection(COLLECTION).doc(sessionId).set(doc)

    return new NextResponse(
      JSON.stringify({
        sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents: 0,
        totalCents: subtotalCents,
        discountTotalCents,
        couponCodes,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      },
    )
  } catch (err) {
    console.error("[cart-session POST] errore:", err)
    return new NextResponse(
      JSON.stringify({ error: "Errore interno creazione sessione carrello" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      },
    )
  }
}

/**
 * GET /api/cart-session?sessionId=...
 * Restituisce struttura normalizzata per il checkout.
 */
export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return new NextResponse(
        JSON.stringify({ error: "sessionId mancante" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return new NextResponse(
        JSON.stringify({ error: "Nessun carrello trovato" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        },
      )
    }

    const data: any = snap.data() || {}

    const currency = (
      data.currency ||
      data.totals?.currency ||
      "EUR"
    )
      .toString()
      .toUpperCase()

    const rawItems: any[] = Array.isArray(data.items) ? data.items : []

    const items: CheckoutItem[] = rawItems.map((item) => {
      const qty = Number(item.quantity || 0)

      const originalPriceCents =
        typeof item.originalPriceCents === "number"
          ? item.originalPriceCents
          : typeof item.price === "number"
          ? item.price
          : typeof item.priceCents === "number"
          ? item.priceCents
          : 0

      const discountedPriceCents =
        typeof item.discountedPriceCents === "number"
          ? item.discountedPriceCents
          : typeof item.priceCents === "number"
          ? item.priceCents
          : originalPriceCents

      const linePriceCents =
        typeof item.linePriceCents === "number"
          ? item.linePriceCents
          : typeof item.line_price === "number"
          ? item.line_price
          : discountedPriceCents * qty

      const lineDiscountCents =
        typeof item.lineDiscountCents === "number"
          ? item.lineDiscountCents
          : typeof item.total_discount === "number"
          ? item.total_discount
          : 0

      const image =
        item.image || item.featured_image?.url || undefined

      return {
        id: item.id,
        title: item.title,
        variantTitle: item.variantTitle || item.variant_title || "",
        quantity: qty,
        priceCents: discountedPriceCents,
        linePriceCents,
        originalPriceCents,
        discountedPriceCents,
        lineDiscountCents,
        image,
      }
    })

    const subtotalCents =
      typeof data.subtotalCents === "number"
        ? data.subtotalCents
        : typeof data.totals?.subtotal === "number"
        ? data.totals.subtotal
        : 0

    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0

    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    const discountTotalCents =
      typeof data.discountTotalCents === "number"
        ? data.discountTotalCents
        : typeof data.rawCart?.total_discount === "number"
        ? data.rawCart.total_discount
        : 0

    const couponCodes: string[] = Array.isArray(data.couponCodes)
      ? data.couponCodes
      : Array.isArray(data.rawCart?.discount_codes)
      ? data.rawCart.discount_codes.map((d: any) => d.code)
      : []

    return new NextResponse(
      JSON.stringify({
        sessionId: data.sessionId || sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents,
        totalCents,
        discountTotalCents,
        couponCodes,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      },
    )
  } catch (err) {
    console.error("[cart-session GET] errore:", err)
    return new NextResponse(
      JSON.stringify({ error: "Errore interno lettura sessione carrello" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      },
    )
  }
}