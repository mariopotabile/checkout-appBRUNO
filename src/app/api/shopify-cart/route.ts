// src/app/api/shopify-cart/route.ts
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { getConfig } from "@/lib/config"
import { db } from "@/lib/firebaseAdmin"

// Questo endpoint verrà chiamato da Shopify (via AJAX o redirect)
// con i dati del carrello. Crea una "sessione" nel nostro DB
// e restituisce una URL di checkout esterno.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Ti lascio la struttura larga per ora, così puoi adattarla
    const {
      cartToken,
      items,
      totals,
    }: {
      cartToken?: string
      items?: any[]
      totals?: {
        subtotal?: number
        total?: number
        currency?: string
      }
    } = body

    if (!cartToken || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Payload carrello non valido" },
        { status: 400 }
      )
    }

    // ⚠️ QUI va usato `await`
    const cfg = await getConfig()

    // Calcolo base importi (se Shopify te li passa già, li usi da `totals`)
    const subtotalPrice =
      typeof totals?.subtotal === "number"
        ? totals.subtotal
        : items.reduce(
            (sum, item) =>
              sum + (item.price ?? 0) * (item.quantity ?? 1),
            0
          )

    const totalPrice =
      typeof totals?.total === "number" ? totals.total : subtotalPrice

    const currency = totals?.currency || "EUR"

    const sessionId = randomUUID()

    const sessionDoc = {
      shopifyCartToken: cartToken,
      items,
      subtotalPrice,
      totalPrice,
      currency,
      createdAt: Date.now(),
    }

    // Salviamo la sessione in Firestore
    await db.collection("cartSessions").doc(sessionId).set(sessionDoc)

    // Dominio checkout da cui serviamo la pagina /checkout
    const checkoutDomain =
      process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || cfg.checkoutDomain

    if (!checkoutDomain) {
      return NextResponse.json(
        { error: "Checkout domain non configurato" },
        { status: 500 }
      )
    }

    const base = checkoutDomain.replace(/\/$/, "")
    const checkoutUrl = `${base}/checkout?sessionId=${encodeURIComponent(
      sessionId
    )}`

    return NextResponse.json(
      {
        sessionId,
        checkoutUrl,
      },
      { status: 200 }
    )
  } catch (err) {
    console.error("[shopify-cart] error:", err)
    return NextResponse.json(
      { error: "Errore interno nel creare la sessione di checkout" },
      { status: 500 }
    )
  }
}