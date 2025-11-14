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

// Helper: aggiunge gli header CORS
function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  return res
}

// Preflight CORS per la chiamata da Shopify
export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 })
  return withCors(res)
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
      return withCors(
        NextResponse.json(
          { error: "Carrello non valido" },
          { status: 400 },
        ),
      )
    }

    const currency = (cart.currency || "EUR").toString().toUpperCase()

    let subtotalCents = 0
    const items: CheckoutItem[] = cart.items.map((item: any) => {
      const quantity = Number(item.quantity ?? 1)

      // Shopify /cart.js: price e line_price sono in centesimi (interi)
      const priceCents = Number(item.price ?? 0)
      const linePriceCents =
        typeof item.line_price === "number" && item.line_price > 0
          ? Number(item.line_price)
          : priceCents * quantity

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

    // Fallback nel caso improbabile in cui subtotalCents sia 0 ma Shopify manda total_price
    if (!subtotalCents && typeof cart.total_price === "number") {
      subtotalCents = Number(cart.total_price)
    }

    const sessionId = randomUUID()

    await db.collection(COLLECTION).doc(sessionId).set({
      sessionId,
      currency,
      items,
      subtotalCents,
      shippingCents: 0,
      totalCents: subtotalCents, // per ora niente spedizione
      rawCart: cart,
      createdAt: new Date().toISOString(),
    })

    return withCors(
      NextResponse.json(
        {
          sessionId,
          currency,
          items,
          subtotalCents,
          shippingCents: 0,
          totalCents: subtotalCents,
        },
        { status: 200 },
      ),
    )
  } catch (error) {
    console.error("[cart-session POST] errore:", error)
    return withCors(
      NextResponse.json(
        { error: "Errore nel salvataggio del carrello" },
        { status: 500 },
      ),
    )
  }
}

/**
 * GET /api/cart-session?sessionId=...
 * Usato dalla pagina /checkout per recuperare il carrello salvato.
 * (chiamata SAME-ORIGIN da Vercel → CORS non strettamente necessario, ma non fa male)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return withCors(
        NextResponse.json(
          { error: "sessionId mancante" },
          { status: 400 },
        ),
      )
    }

    const snap = await db.collection(COLLECTION).doc(sessionId).get()

    if (!snap.exists) {
      return withCors(
        NextResponse.json(
          { error: "Nessun carrello trovato" },
          { status: 404 },
        ),
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

    return withCors(
      NextResponse.json(
        {
          sessionId,
          currency,
          items,
          subtotalCents,
          shippingCents,
          totalCents,
        },
        { status: 200 },
      ),
    )
  } catch (error) {
    console.error("[cart-session GET] errore:", error)
    return withCors(
      NextResponse.json(
        { error: "Errore nel recupero del carrello" },
        { status: 500 },
      ),
    )
  }
}