// src/app/api/cart-session/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

const COLLECTION = "cartSessions"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionId, cart } = body

    if (!sessionId || !cart) {
      return NextResponse.json(
        { error: "sessionId o cart mancanti" },
        { status: 400 },
      )
    }

    await db.collection(COLLECTION).doc(String(sessionId)).set({
      cart,
      createdAt: Date.now(),
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[cart-session POST] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel salvataggio del carrello" },
      { status: 500 },
    )
  }
}

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

    const snap = await db.collection(COLLECTION).doc(String(sessionId)).get()

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Carrello non trovato o scaduto" },
        { status: 404 },
      )
    }

    const data = snap.data() || {}
    return NextResponse.json({ cart: data.cart || null })
  } catch (err: any) {
    console.error("[cart-session GET] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel recupero del carrello" },
      { status: 500 },
    )
  }
}