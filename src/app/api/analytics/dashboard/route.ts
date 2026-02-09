// src/app/api/analytics/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/firebaseAdmin"

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin")
    const { searchParams } = new URL(req.url)

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const compareStartDate = searchParams.get('compareStartDate')
    const compareEndDate = searchParams.get('compareEndDate')
    const limit = parseInt(searchParams.get('limit') || '1000')

    console.log('[Dashboard API] 📊 Caricamento analytics...')

    // Query principale
    let query = db.collection('purchaseEvents').orderBy('timestamp', 'desc')

    if (startDate) {
      query = query.where('timestamp', '>=', startDate)
    }
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      query = query.where('timestamp', '<=', endDateTime.toISOString())
    }

    const snapshot = await query.limit(limit).get()

    // Query di confronto (se richiesta)
    let compareSnapshot = null
    if (compareStartDate && compareEndDate) {
      let compareQuery = db.collection('purchaseEvents').orderBy('timestamp', 'desc')
      compareQuery = compareQuery.where('timestamp', '>=', compareStartDate)
      const compareEndDateTime = new Date(compareEndDate)
      compareEndDateTime.setHours(23, 59, 59, 999)
      compareQuery = compareQuery.where('timestamp', '<=', compareEndDateTime.toISOString())
      compareSnapshot = await compareQuery.limit(limit).get()
    }

    if (snapshot.empty) {
      return NextResponse.json(
        {
          totalPurchases: 0,
          totalRevenue: 0,
          avgOrderValue: 0,
          uniqueCustomers: 0,
          byCampaign: [],
          bySource: [],
          byAd: [],
          byProduct: [],
          byCampaignDetail: [],
          recentPurchases: [],
          dailyRevenue: [],
          hourlyRevenue: [],
          comparison: null
        },
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(origin),
          },
        }
      )
    }

    const purchases = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`[Dashboard API] 📦 ${purchases.length} purchases trovati`)

    // ═══════════════════════════════════════════════════════════
    // AGGREGAZIONI
    // ═══════════════════════════════════════════════════════════

    let totalRevenue = 0
    const byCampaign: Record<string, any> = {}
    const bySource: Record<string, any> = {}
    const byAd: Record<string, any> = {}
    const byProduct: Record<string, any> = {}
    const byCampaignDetail: Record<string, any> = {}
    const dailyRevenue: Record<string, number> = {}
    const hourlyRevenue: Record<number, number> = {}
    const customerEmails = new Set()

    purchases.forEach((purchase: any) => {
      const value = purchase.value || 0
      totalRevenue += value

      // Customer tracking
      if (purchase.customer?.email) {
        customerEmails.add(purchase.customer.email)
      }

      // Aggregazione per campagna
      const campaign = purchase.utm?.campaign || 'direct'
      const source = purchase.utm?.source || 'direct'
      const medium = purchase.utm?.medium || 'none'
      const campaignKey = `${source}/${medium}/${campaign}`

      if (!byCampaign[campaignKey]) {
        byCampaign[campaignKey] = {
          campaign,
          source,
          medium,
          purchases: 0,
          revenue: 0,
          orders: []
        }
      }

      byCampaign[campaignKey].purchases += 1
      byCampaign[campaignKey].revenue += value
      byCampaign[campaignKey].orders.push({
        orderNumber: purchase.orderNumber,
        value,
        timestamp: purchase.timestamp
      })

      // Aggregazione per sorgente
      if (!bySource[source]) {
        bySource[source] = {
          source,
          purchases: 0,
          revenue: 0
        }
      }
      bySource[source].purchases += 1
      bySource[source].revenue += value

      // Aggregazione per ad
      if (purchase.utm?.content) {
        const adId = purchase.utm.content
        if (!byAd[adId]) {
          byAd[adId] = {
            adId,
            campaign,
            source,
            purchases: 0,
            revenue: 0
          }
        }
        byAd[adId].purchases += 1
        byAd[adId].revenue += value
      }

      // Aggregazione per prodotto
      if (purchase.items && Array.isArray(purchase.items)) {
        purchase.items.forEach((item: any) => {
          const productKey = item.title || 'Unknown'
          if (!byProduct[productKey]) {
            byProduct[productKey] = {
              title: productKey,
              quantity: 0,
              revenue: 0,
              orders: 0
            }
          }
          byProduct[productKey].quantity += item.quantity || 0
          byProduct[productKey].revenue += (item.linePriceCents || item.priceCents || 0) / 100
          byProduct[productKey].orders += 1
        })
      }

      // ═══════════════════════════════════════════════════════════
      // ✅ NUOVA AGGREGAZIONE: CAMPAGNA CON AD SET E AD NAME
      // ═══════════════════════════════════════════════════════════
      
      // ✅ Leggi i dati dal posto giusto (purchase.utm)
      const adsetName = purchase.utm?.adset_name || null
      const adName = purchase.utm?.ad_name || null
      const campaignId = purchase.utm?.campaign_id || null
      const adsetId = purchase.utm?.adset_id || null
      const adId = purchase.utm?.ad_id || null
      const fbclid = purchase.utm?.fbclid || null
      const gclid = purchase.utm?.gclid || null

      const campaignDetailKey = `${source}__${campaign}`

      if (!byCampaignDetail[campaignDetailKey]) {
        byCampaignDetail[campaignDetailKey] = {
          campaign,
          source,
          medium,
          orders: [],
          totalRevenue: 0,
          totalOrders: 0,
        }
      }

      byCampaignDetail[campaignDetailKey].totalRevenue += value
      byCampaignDetail[campaignDetailKey].totalOrders += 1

      byCampaignDetail[campaignDetailKey].orders.push({
        orderNumber: purchase.orderNumber,
        orderId: purchase.orderId,
        sessionId: purchase.sessionId,
        value,
        timestamp: purchase.timestamp,
        // ✅ Tutti i parametri ads
        adSet: adsetName,
        adName: adName,
        campaignId: campaignId,
        adsetId: adsetId,
        adId: adId,
        fbclid: fbclid,
        gclid: gclid,
        customer: purchase.customer?.email || null,
        items: purchase.items || [],
      })

      // Aggregazione giornaliera
      const date = purchase.timestamp?.split('T')[0] || 'unknown'
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0
      }
      dailyRevenue[date] += value

      // Aggregazione oraria
      if (purchase.timestamp) {
        const hour = new Date(purchase.timestamp).getHours()
        if (!hourlyRevenue[hour]) {
          hourlyRevenue[hour] = 0
        }
        hourlyRevenue[hour] += value
      }
    })

    // Ordina aggregazioni
    const campaignStats = Object.values(byCampaign)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const sourceStats = Object.values(bySource)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const adStats = Object.values(byAd)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    const productStats = Object.values(byProduct)
      .sort((a: any, b: any) => b.revenue - a.revenue)

    // ✅ Ordina campaignDetailStats
    const campaignDetailStats = Object.values(byCampaignDetail)
      .map((camp: any) => ({
        campaign: camp.campaign,
        source: camp.source,
        medium: camp.medium,
        totalRevenue: parseFloat(camp.totalRevenue.toFixed(2)),
        totalOrders: camp.totalOrders,
        cpa: camp.totalOrders > 0 
          ? parseFloat((camp.totalRevenue / camp.totalOrders).toFixed(2)) 
          : 0,
        orders: camp.orders.sort((a: any, b: any) => 
          b.timestamp.localeCompare(a.timestamp)
        )
      }))
      .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)

    // Daily revenue array
    const dailyRevenueArray = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Hourly revenue array
    const hourlyRevenueArray = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: hourlyRevenue[i] || 0
    }))

    // ═══════════════════════════════════════════════════════════
    // COMPARISON DATA
    // ═══════════════════════════════════════════════════════════

    let comparison = null
    if (compareSnapshot && !compareSnapshot.empty) {
      const comparePurchases = compareSnapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }))

      const compareRevenue = comparePurchases.reduce((sum: number, p: any) => sum + (p.value || 0), 0)
      const compareCount = comparePurchases.length
      const compareAvgOrder = compareCount > 0 ? compareRevenue / compareCount : 0

      comparison = {
        purchases: compareCount,
        revenue: parseFloat(compareRevenue.toFixed(2)),
        avgOrderValue: parseFloat(compareAvgOrder.toFixed(2)),
        purchasesDiff: purchases.length - compareCount,
        revenueDiff: parseFloat((totalRevenue - compareRevenue).toFixed(2)),
        avgOrderDiff: parseFloat(((totalRevenue / purchases.length) - compareAvgOrder).toFixed(2)),
        purchasesPercent: compareCount > 0 ? parseFloat((((purchases.length - compareCount) / compareCount) * 100).toFixed(1)) : 0,
        revenuePercent: compareRevenue > 0 ? parseFloat((((totalRevenue - compareRevenue) / compareRevenue) * 100).toFixed(1)) : 0,
      }
    }

    // ═══════════════════════════════════════════════════════════
    // RESPONSE FINALE
    // ═══════════════════════════════════════════════════════════

    const response = {
      totalPurchases: purchases.length,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      avgOrderValue: parseFloat((totalRevenue / purchases.length).toFixed(2)),
      uniqueCustomers: customerEmails.size,
      byCampaign: campaignStats,
      bySource: sourceStats,
      byAd: adStats,
      byProduct: productStats.slice(0, 10), // Top 10 prodotti
      byCampaignDetail: campaignDetailStats,  // ✅ NUOVO! Con Ad Set e Ad Name
      recentPurchases: purchases.slice(0, 20),
      dailyRevenue: dailyRevenueArray,
      hourlyRevenue: hourlyRevenueArray,
      comparison,
      dateRange: {
        start: startDate || 'all',
        end: endDate || 'all'
      }
    }

    console.log('[Dashboard API] ✅ Analytics elaborate')
    console.log(`[Dashboard API] 📊 Campagne con dettagli: ${campaignDetailStats.length}`)

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    })
  } catch (err) {
    console.error('[Dashboard API] ❌ Errore:', err)
    return NextResponse.json(
      { 
        error: 'Errore caricamento dashboard',
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

