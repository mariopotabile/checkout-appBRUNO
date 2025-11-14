// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { db } from "@/lib/firebaseAdmin"

interface CheckoutItem {
  id: number | string
  title: string
  variantTitle?: string
  quantity: number
  priceCents: number
  linePriceCents: number
  image?: string
}

const COLLECTION = "checkoutSessions"

// Funzione robusta per convertire qualsiasi valore in centesimi
function toCents(value: any): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : 0
  }

  if (typeof value === "string") {
    const trimmed = value.trim().replace(",", ".")
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return 0

    // Se nella stringa c'è un '.', assumiamo che sia in unità (es. 22.30 -> 2230)
    if (trimmed.includes(".")) {
      return Math.round(n * 100)
    }

    // Altrimenti assumiamo che sia già in centesimi (es. "2230")
    return Math.round(n)
  }

  return 0
}

/**
 * POST /api/cart-session
 * Chiamato dal tema Shopify (main-cart.liquid)
 * Body: { cart: <dati di /cart.js> }
 * Salva il carrello in Firestore e restituisce sessionId + riepilogo.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const cart = body.cart

    if (!cart || !Array.isArray(cart.items)) {
      return NextResponse.json(
        { error: "Carrello non valido" },
        { status: 400 },
      )
    }

    const currency = (cart.currency || "EUR").toString().toUpperCase()

    let subtotalCents = 0

    const items: CheckoutItem[] = cart.items.map((item: any) => {
      const quantity = Number(item.quantity ?? 1)

      // Shopify /cart.js:
      // - price: prezzo unitario in centesimi (es. 2230)
      // - line_price: totale riga in centesimi (es. 2230 per qty=1)
      const priceCents = toCents(item.price)
      const rawLinePrice = item.line_price ?? priceCents * quantity
      const linePriceCents = toCents(rawLinePrice)

      subtotalCents += linePriceCents

      return {
        id: item.id,
        title: item.title,
        variantTitle: item.variant_title || "",
        quantity,
        priceCents,
        linePriceCents,
        image: item.image,
      }
    })

    // Fallback: se per qualche motivo subtotalCents è 0 ma Shopify manda total_price
    if (!subtotalCents && typeof cart.total_price !== "undefined") {
      subtotalCents = toCents(cart.total_price)
    }

    const sessionId = randomUUID()

    await db.collection(COLLECTION).doc(sessionId).set({
      sessionId,
      currency,
      items,
      subtotalCents,
      shippingCents: 0,
      totalCents: subtotalCents, // per ora solo prodotti, senza spedizione
      rawCart: cart,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json(
      {
        sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents: 0,
        totalCents: subtotalCents,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[cart-session POST] errore:", error)
    return NextResponse.json(
      { error: "Errore nel salvataggio del carrello" },
      { status: 500 },
    )
  }
}

/**
 * GET /api/cart-session?sessionId=...
 * Usato dalla pagina /checkout per recuperare il carrello salvato.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId mancante" },
        { status: 400 },
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Nessun carrello trovato" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}

    const currency = (data.currency || "EUR").toString().toUpperCase()
    const items = Array.isArray(data.items) ? data.items : []
    const subtotalCents =
      typeof data.subtotalCents === "number" ? data.subtotalCents : 0
    const shippingCents =
      typeof data.shippingCents === "number" ? data.shippingCents : 0
    const totalCents =
      typeof data.totalCents === "number"
        ? data.totalCents
        : subtotalCents + shippingCents

    return NextResponse.json(
      {
        sessionId,
        currency,
        items,
        subtotalCents,
        shippingCents,
        totalCents,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[cart-session GET] errore:", error)
    return NextResponse.json(
      { error: "Errore nel recupero del carrello" },
      { status: 500 },
    )
  }
}