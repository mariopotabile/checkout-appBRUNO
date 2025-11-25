// src/app/api/admin/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/firebaseAdmin'

export async function GET(req: NextRequest) {
  try {
    // Verifica password
    const authHeader = req.headers.get('authorization')
    const password = authHeader?.replace('Bearer ', '')
    
    const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY
    
    if (!ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Admin key non configurata' }, { status: 500 })
    }
    
    if (password !== ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: 'Password errata' }, { status: 401 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
    
    // Recupera ultimi 100 payment intents
    const payments = await stripe.paymentIntents.list({
      limit: 100,
    })

    // Recupera sessioni da Firebase per avere email e dettagli
    const sessionsSnapshot = await db.collection('cartSessions')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()

    const sessions = new Map()
    sessionsSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.paymentIntentId) {
        sessions.set(data.paymentIntentId, {
          sessionId: doc.id,
          email: data.customer?.email,
          fullName: data.customer?.fullName,
          items: data.items || [],
          shopifyOrderNumber: data.shopifyOrderNumber,
        })
      }
    })

    // Formatta transazioni
    const transactions = payments.data.map(payment => {
      const session = sessions.get(payment.id)
      
      return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        created: payment.created,
        email: session?.email || payment.receipt_email || 'N/A',
        fullName: session?.fullName || 'N/A',
        items: session?.items || [],
        orderNumber: session?.shopifyOrderNumber,
        errorCode: payment.last_payment_error?.code,
        errorMessage: payment.last_payment_error?.message,
        declineCode: payment.last_payment_error?.decline_code,
      }
    })

    return NextResponse.json({ transactions })
  } catch (error: any) {
    console.error('[Admin] Errore:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
