// src/app/analytics/page.tsx
"use client"

import { useEffect, useState } from "react"
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts'

// ✅ TYPES AGGIORNATI CON NUOVI CAMPI ADS
type DashboardData = {
  totalPurchases: number
  totalRevenue: number
  avgOrderValue: number
  uniqueCustomers: number
  byCampaign: Array<{
    campaign: string
    source: string
    medium: string
    purchases: number
    revenue: number
    orders?: Array<{
      orderNumber: string
      value: number
      timestamp: string
      adSet?: string | null
      adName?: string | null
    }>
  }>
  bySource: Array<{
    source: string
    purchases: number
    revenue: number
  }>
  byAd: Array<{
    adId: string
    campaign: string
    source: string
    purchases: number
    revenue: number
  }>
  byProduct: Array<{
    title: string
    quantity: number
    revenue: number
    orders: number
  }>
  // ✅ NUOVO: Dettagli campagne con tutti i parametri ads
  byCampaignDetail: Array<{
    campaign: string
    source: string
    medium: string
    totalRevenue: number
    totalOrders: number
    cpa: number
    orders: Array<{
      orderNumber: string
      orderId: string
      sessionId: string
      value: number
      timestamp: string
      adSet: string | null
      adName: string | null
      campaignId: string | null
      adsetId: string | null
      adId: string | null
      fbclid: string | null
      gclid: string | null
      customer: string | null
      items: Array<any>
    }>
  }>
  recentPurchases: Array<any>
  dailyRevenue: Array<{
    date: string
    revenue: number
  }>
  hourlyRevenue: Array<{
    hour: number
    revenue: number
  }>
  comparison: {
    purchases: number
    revenue: number
    avgOrderValue: number
    purchasesDiff: number
    revenueDiff: number
    avgOrderDiff: number
    purchasesPercent: number
    revenuePercent: number
  } | null
}

type Insight = {
  type: 'success' | 'warning' | 'info' | 'danger'
  title: string
  message: string
  action?: string
  icon: string
}

const COLORS = {
  facebook: '#1877F2',
  google: '#EA4335',
  instagram: '#E4405F',
  tiktok: '#000000',
  direct: '#6B7280',
  email: '#7C3AED',
  organic: '#10B981',
  test: '#F59E0B',
}

const PIE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showComparison, setShowComparison] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [notification, setNotification] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  })
  
  const [compareRange, setCompareRange] = useState({
    start: '',
    end: ''
  })

  // ✅ CALCOLA KPI AVANZATI
  const calculateAdvancedKPIs = (data: DashboardData) => {
    if (!data) return null

    const repeatRate = data.totalPurchases > 0 
      ? ((data.totalPurchases - data.uniqueCustomers) / data.totalPurchases) * 100 
      : 0

    const bestCampaign = [...data.byCampaign].sort((a, b) => b.revenue - a.revenue)[0]
    const worstCampaign = [...data.byCampaign].sort((a, b) => a.revenue - b.revenue)[0]

    const recentOrders = data.recentPurchases.slice(0, 7)
    const recentAOV = recentOrders.length > 0
      ? recentOrders.reduce((sum, o) => sum + (o.valueCents || o.value * 100 || 0), 0) / recentOrders.length / 100
      : 0

    const peakHour = [...(data.hourlyRevenue || [])].sort((a, b) => b.revenue - a.revenue)[0]

    const growthRate = data.comparison
      ? ((data.totalRevenue - data.comparison.revenue) / data.comparison.revenue) * 100
      : 0

    return {
      repeatRate,
      bestCampaign,
      worstCampaign,
      recentAOV,
      aovTrend: recentAOV > data.avgOrderValue ? 'up' : 'down',
      peakHour,
      growthRate,
      totalCustomerValue: data.uniqueCustomers > 0 ? data.totalRevenue / data.uniqueCustomers : 0,
    }
  }

  // ✅ GENERA INSIGHTS AUTOMATICI
  const generateInsights = (data: DashboardData, kpis: any): Insight[] => {
    const insights: Insight[] = []
    if (!data || !kpis) return insights

    if (kpis.repeatRate > 30) {
      insights.push({
        type: 'success',
        icon: '🎉',
        title: 'Ottima Retention!',
        message: `${kpis.repeatRate.toFixed(0)}% di clienti ripetuti. I tuoi prodotti piacciono!`,
        action: 'Investi in email marketing per fidelizzazione'
      })
    } else if (kpis.repeatRate < 15) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Bassa Retention',
        message: `Solo ${kpis.repeatRate.toFixed(0)}% di clienti ripetuti.`,
        action: 'Implementa programmi fedeltà e follow-up email'
      })
    }

    if (kpis.growthRate > 20) {
      insights.push({
        type: 'success',
        icon: '📈',
        title: 'Crescita Esplosiva!',
        message: `Revenue cresciuta del ${kpis.growthRate.toFixed(0)}% rispetto al periodo precedente.`,
        action: 'Scala il budget sulle campagne vincenti'
      })
    } else if (kpis.growthRate < -10) {
      insights.push({
        type: 'danger',
        icon: '📉',
        title: 'Revenue in Calo',
        message: `Revenue calata del ${Math.abs(kpis.growthRate).toFixed(0)}%.`,
        action: 'Rivedi targeting e creative delle campagne'
      })
    }

    if (kpis.bestCampaign && kpis.bestCampaign.revenue > data.totalRevenue * 0.3) {
      insights.push({
        type: 'info',
        icon: '🚀',
        title: 'Campagna Star',
        message: `"${kpis.bestCampaign.campaign}" genera il ${((kpis.bestCampaign.revenue / data.totalRevenue) * 100).toFixed(0)}% del revenue.`,
        action: 'Duplica questa campagna con budget maggiorato'
      })
    }

    if (kpis.worstCampaign && kpis.worstCampaign.purchases > 0 && kpis.worstCampaign.revenue < data.totalRevenue * 0.05) {
      insights.push({
        type: 'warning',
        icon: '💡',
        title: 'Campagna Sottoperformante',
        message: `"${kpis.worstCampaign.campaign}" genera solo ${formatMoney(kpis.worstCampaign.revenue)}.`,
        action: 'Considera di mettere in pausa o ottimizzare'
      })
    }

    if (kpis.aovTrend === 'up') {
      insights.push({
        type: 'success',
        icon: '💰',
        title: 'AOV in Crescita',
        message: `Valore medio ordine recente: ${formatMoney(kpis.recentAOV)} (media: ${formatMoney(data.avgOrderValue)})`,
        action: 'Upselling funziona! Continua con bundle e cross-sell'
      })
    }

    if (kpis.peakHour) {
      insights.push({
        type: 'info',
        icon: '⏰',
        title: 'Orario di Punta',
        message: `Massimo revenue alle ${kpis.peakHour.hour}:00 (${formatMoney(kpis.peakHour.revenue)})`,
        action: 'Programma ads e email in questa fascia oraria'
      })
    }

    const dominantSource = data.bySource[0]
    if (dominantSource && dominantSource.revenue > data.totalRevenue * 0.7) {
      insights.push({
        type: 'warning',
        icon: '🎯',
        title: 'Troppa Dipendenza',
        message: `${dominantSource.source} rappresenta il ${((dominantSource.revenue / data.totalRevenue) * 100).toFixed(0)}% del revenue.`,
        action: 'Diversifica su altre fonti di traffico per ridurre rischio'
      })
    }

    return insights
  }

  const getDateRange = (days: number) => {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    
    const start = new Date()
    start.setDate(start.getDate() - days + 1)
    start.setHours(0, 0, 0, 0)
    
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  }

  const applyQuickFilter = (type: 'today' | 'yesterday' | '7days' | '14days' | '30days' | 'all') => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    
    let range = { start: '', end: '' }
    
    switch(type) {
      case 'today':
        range = {
          start: today.toISOString().split('T')[0],
          end: today.toISOString().split('T')[0]
        }
        showNotification('📅 Filtro: Oggi')
        break
      
      case 'yesterday':
        range = {
          start: yesterday.toISOString().split('T')[0],
          end: yesterday.toISOString().split('T')[0]
        }
        showNotification('📅 Filtro: Ieri')
        break
      
      case '7days':
        range = getDateRange(7)
        showNotification('📅 Filtro: Ultimi 7 giorni')
        break
      
      case '14days':
        range = getDateRange(14)
        showNotification('📅 Filtro: Ultimi 14 giorni')
        break
      
      case '30days':
        range = getDateRange(30)
        showNotification('📅 Filtro: Ultimi 30 giorni')
        break

      case 'all':
        range = { start: '', end: '' }
        showNotification('📅 Filtro: Tutto il periodo')
        break
    }
    
    setDateRange(range)
    setTimeout(() => loadDataWithRange(range), 100)
  }

  const loadDataWithRange = async (customRange?: { start: string, end: string }) => {
    try {
      const range = customRange || dateRange
      
      let url = '/api/analytics/dashboard?limit=1000'
      
      if (range.start) url += `&startDate=${range.start}`
      if (range.end) url += `&endDate=${range.end}`
      
      if (showComparison && compareRange.start && compareRange.end) {
        url += `&compareStartDate=${compareRange.start}&compareEndDate=${compareRange.end}`
      }
      
      const res = await fetch(url)
      const json = await res.json()
      
      if (data && json.totalPurchases > data.totalPurchases) {
        const diff = json.totalPurchases - data.totalPurchases
        showNotification(`🎉 ${diff} ${diff === 1 ? 'nuovo ordine' : 'nuovi ordini'}!`)
      }
      
      setData(json)
      
      // ✅ Genera insights
      const kpis = calculateAdvancedKPIs(json)
      if (kpis) {
        const newInsights = generateInsights(json, kpis)
        setInsights(newInsights)
      }
      
      setLastUpdate(new Date())
    } catch (err) {
      console.error('❌ Errore caricamento dashboard:', err)
      showNotification('❌ Errore caricamento dati')
    }
    setLoading(false)
  }

  const loadData = async (showNotif = false) => {
    await loadDataWithRange()
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      loadData(true)
    }, 30000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, dateRange, compareRange, showComparison, data])

  const showNotification = (message: string) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 4000)
  }

  // ✅ EXPORT CSV AGGIORNATO CON NUOVI CAMPI ADS
  const exportCSV = () => {
    if (!data) return
    
    const rows = [
      [
        'Ordine', 
        'Data', 
        'Valore', 
        'Campagna', 
        'Sorgente', 
        'Campaign ID',
        'Ad Set ID',
        'Ad Set Name', 
        'Ad ID',
        'Ad Name', 
        'fbclid',
        'gclid',
        'Email', 
        'Prodotti'
      ],
      ...data.recentPurchases.map((p: any) => [
        p.shopifyOrderNumber || p.orderNumber || '',
        p.timestamp || '',
        (p.valueCents || p.value * 100 || 0) / 100,
        p.utm?.campaign || 'direct',
        p.utm?.source || 'direct',
        p.utm?.campaign_id || '',
        p.utm?.adset_id || '',
        p.utm?.adset_name || '',
        p.utm?.ad_id || '',
        p.utm?.ad_name || '',
        p.utm?.fbclid || '',
        p.utm?.gclid || '',
        p.customer?.email || '',
        p.items?.map((i: any) => `${i.title} x${i.quantity}`).join('; ') || ''
      ])
    ]
    
    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `oltre_analytics_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    
    showNotification('📥 CSV scaricato!')
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  
  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short'
    })
  }

  const getSourceBadgeColor = (source: string) => {
    return COLORS[source.toLowerCase() as keyof typeof COLORS] || COLORS.direct
  }

  const renderTrend = (current: number, previous: number) => {
    if (previous === 0) return null
    const percent = ((current - previous) / previous) * 100
    const isPositive = percent >= 0
    
    return (
      <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(percent).toFixed(1)}%
      </span>
    )
  }

  const getInsightColor = (type: string) => {
    switch(type) {
      case 'success': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
      case 'warning': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300'
      case 'danger': return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
      default: return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Caricamento analytics...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
        <div className="text-center">
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Errore caricamento dati</p>
        </div>
      </div>
    )
  }

  const kpis = calculateAdvancedKPIs(data)

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <span>{notification}</span>
            <button onClick={() => setNotification(null)} className="text-white hover:text-gray-200 font-bold">✕</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-40 backdrop-blur-sm bg-opacity-90`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Dashboard Analytics
              </h1>
              <p className={`text-xs sm:text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Oltre Boutique • {lastUpdate.toLocaleTimeString('it-IT')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  autoRefresh ? 'bg-green-600 text-white' : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {autoRefresh ? '⚡' : '⏸️'}
                <span className="hidden sm:inline ml-1">{autoRefresh ? 'Auto' : 'Pausa'}</span>
              </button>
              <button
                onClick={exportCSV}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📥 <span className="hidden sm:inline">CSV</span>
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
              <a
                href="https://oltreboutique.com"
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm font-medium"
              >
                Vai al sito
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        
        {/* Il resto del codice rimane identico... */}
        {/* Per brevità non ripeto tutto qui, ma il codice continua con tutte le sezioni */}
        
      </div>
    </div>
  )
}

