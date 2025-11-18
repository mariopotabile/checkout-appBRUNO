// src/app/api/stripe-status/route.ts
import { NextResponse } from 'next/server'
import { getCurrentAccountInfo } from '@/lib/stripeRotation'

export async function GET() {
  try {
    const info = await getCurrentAccountInfo()
    
    return NextResponse.json({
      currentAccount: info.account.label,
      slotNumber: info.slotNumber,
      totalSlots: info.totalSlots,
      nextRotation: info.nextRotation.toISOString(),
      nextRotationLocal: info.nextRotation.toLocaleString('it-IT'),
    })
  } catch (error: any) {
    console.error('[Stripe Status Error]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
