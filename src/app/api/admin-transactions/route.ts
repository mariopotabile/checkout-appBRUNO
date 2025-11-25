// src/app/api/admin-transactions/route.ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET() {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '')
    
    const payments = await stripe.paymentIntents.list({
      limit: 100,
    })

    const transactions = payments.data.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      created: payment.created,
      email: payment.receipt_email || 'N/A',
      errorCode: payment.last_payment_error?.code,
      errorMessage: payment.last_payment_error?.message,
      declineCode: payment.last_payment_error?.decline_code,
    }))

    return NextResponse.json({ transactions })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
