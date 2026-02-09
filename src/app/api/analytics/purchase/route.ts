// src/app/api/analytics/purchase/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const data = await req.json()
    
    console.log('[Analytics API] 💾 Salvataggio purchase event...')
    
    // Genera ID univoco
    const docRef = db.collection('purchaseEvents').doc()
    
    // Salva in Firestore
    await docRef.set({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    console.log('[Analytics API] ✅ Purchase event salvato - ID:', docRef.id)

    return NextResponse.json(
      { 
        success: true, 
        id: docRef.id 
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(origin),
        },
      }
    )
  } catch (err) {
    console.error('[Analytics API] ❌ Errore:', err)
    return NextResponse.json(
      { 
        error: 'Errore salvataggio analytics',
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(null),
        },
      }
    )
  }
}
