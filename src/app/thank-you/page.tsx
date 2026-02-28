"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

export const dynamic = "force-dynamic"

type OrderItem = {
  id: string | number
  title: string
  variantTitle?: string
  quantity: number
  priceCents?: number
  linePriceCents?: number
  image?: string
}

type SessionData = {
  sessionId: string
  shopifyOrderNumber?: string | number
  customer?: {
    fullName?: string
    email?: string
    address1?: string
    city?: string
    postalCode?: string
    province?: string
    countryCode?: string
  }
  items?: OrderItem[]
  totalCents?: number
  currency?: string
  upsellStatus?: string
  upsellProduct?: {
    productTitle?: string
    variantTitle?: string
    priceCents?: number
    image?: string
  }
  upsellAmountCents?: number
}

function formatMoney(cents: number | undefined, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100)
}

function ThankYouContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!sessionId) { setLoading(false); return }
      try {
        const res = await fetch(`/api/cart-session?sessionId=${sessionId}`)
        const data = await res.json()
        if (res.ok) setSession(data)
      } catch (_) {}
      finally { setLoading(false) }
    }
    load()
  }, [sessionId])

  const currency = session?.currency || "EUR"
  const customer = session?.customer || {}
  const items = session?.items || []
  const orderNumber = session?.shopifyOrderNumber

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Sora', sans-serif;
          background: linear-gradient(160deg, #fdf8f3 0%, #f0e9e0 100%);
          min-height: 100vh;
        }

        .page-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .page-header {
          width: 100%;
          padding: 16px 24px;
          background: white;
          border-bottom: 1px solid #e8e0d8;
          display: flex;
          justify-content: center;
        }

        .page-header img {
          height: 36px;
          max-width: 140px;
          object-fit: contain;
        }

        .main-content {
          width: 100%;
          max-width: 560px;
          padding: 32px 16px 80px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Success hero */
        .hero-card {
          background: white;
          border-radius: 24px;
          padding: 36px 24px;
          text-align: center;
          box-shadow: 0 4px 24px rgba(0,0,0,0.07);
          animation: fadeUp 0.5s ease;
        }

        .check-circle {
          width: 72px;
          height: 72px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 32px;
          box-shadow: 0 8px 24px rgba(34,197,94,0.35);
          animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
        }

        .hero-title {
          font-size: 26px;
          font-weight: 800;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .hero-subtitle {
          font-size: 14px;
          color: #666;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .order-number-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #f5f0eb;
          border: 1px solid #e8e0d8;
          border-radius: 10px;
          padding: 10px 18px;
          font-size: 14px;
          color: #555;
        }

        .order-number-badge strong {
          color: #1a1a1a;
          font-weight: 700;
        }

        /* Info card */
        .info-card {
          background: white;
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
          animation: fadeUp 0.5s ease 0.1s both;
        }

        .card-title {
          font-size: 14px;
          font-weight: 700;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 16px;
        }

        /* Items */
        .item-row {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #f5f0eb;
        }

        .item-row:last-child { border-bottom: none; }

        .item-img {
          width: 52px;
          height: 52px;
          object-fit: cover;
          border-radius: 10px;
          flex-shrink: 0;
        }

        .item-img-placeholder {
          width: 52px;
          height: 52px;
          background: #f0e9e0;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .item-info { flex: 1; min-width: 0; }

        .item-title {
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .item-variant {
          font-size: 12px;
          color: #999;
          margin-top: 2px;
        }

        .item-qty {
          font-size: 12px;
          color: #aaa;
          margin-top: 2px;
        }

        .item-price {
          font-size: 14px;
          font-weight: 700;
          color: #1a1a1a;
          flex-shrink: 0;
        }

        /* Totals */
        .totals {
          border-top: 1px solid #f0e9e0;
          padding-top: 14px;
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .total-row .label { color: #666; }
        .total-row .value { font-weight: 600; color: #1a1a1a; }
        .total-row .green { color: #22c55e; font-weight: 600; }

        .total-row.final {
          font-size: 17px;
          padding-top: 8px;
          border-top: 1px solid #e8e0d8;
        }

        .total-row.final .label { font-weight: 700; color: #1a1a1a; }
        .total-row.final .value { font-weight: 800; color: #1a1a1a; }

        /* Upsell recap */
        .upsell-recap {
          background: linear-gradient(135deg, #fff7ed, #fef3c7);
          border: 1px solid #fed7aa;
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 12px;
        }

        .upsell-recap-img {
          width: 44px;
          height: 44px;
          object-fit: cover;
          border-radius: 8px;
          flex-shrink: 0;
        }

        .upsell-recap-text { flex: 1; }

        .upsell-recap-label {
          font-size: 11px;
          font-weight: 700;
          color: #f59e0b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .upsell-recap-title {
          font-size: 13px;
          font-weight: 600;
          color: #1a1a1a;
          margin-top: 2px;
        }

        /* Address */
        .address-text {
          font-size: 14px;
          color: #555;
          line-height: 1.8;
        }

        /* Steps */
        .steps {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .step {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }

        .step-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .step-text .step-title {
          font-size: 14px;
          font-weight: 700;
          color: #1a1a1a;
          margin-bottom: 2px;
        }

        .step-text .step-desc {
          font-size: 12px;
          color: #888;
          line-height: 1.5;
        }

        /* Back btn */
        .back-btn {
          display: block;
          width: 100%;
          padding: 16px;
          background: #1a1a1a;
          color: white;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          text-align: center;
          text-decoration: none;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        }

        .back-btn:hover {
          background: #333;
          transform: translateY(-1px);
        }

        /* Loading */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          gap: 16px;
        }

        .spinner {
          width: 40px; height: 40px;
          border: 3px solid #e8e0d8;
          border-top-color: #22c55e;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="page-wrap">
        <header className="page-header">
          <img
            src="https://cdn.shopify.com/s/files/1/0927/1902/2465/files/LOGO_NIMEA.png?v=1771617668"
            alt="Nimea"
          />
        </header>

        <div className="main-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p style={{ fontSize: 14, color: "#999" }}>Caricamento ordine…</p>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div className="hero-card">
                <div className="check-circle">✓</div>
                <h1 className="hero-title">
                  {customer.fullName
                    ? `Grazie, ${customer.fullName.split(" ")[0]}!`
                    : "Grazie per il tuo ordine!"}
                </h1>
                <p className="hero-subtitle">
                  Il tuo ordine è confermato. Riceverai una email di conferma
                  {customer.email ? ` a ${customer.email}` : ""} con tutti i dettagli.
                </p>
                {orderNumber && (
                  <div className="order-number-badge">
                    📦 Ordine <strong>#{orderNumber}</strong>
                  </div>
                )}
              </div>

              {/* Riepilogo ordine */}
              {items.length > 0 && (
                <div className="info-card" style={{ animationDelay: "0.15s" }}>
                  <p className="card-title">Riepilogo ordine</p>

                  {items.map((item, idx) => (
                    <div key={idx} className="item-row">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="item-img" />
                      ) : (
                        <div className="item-img-placeholder">📦</div>
                      )}
                      <div className="item-info">
                        <p className="item-title">{item.title}</p>
                        {item.variantTitle && <p className="item-variant">{item.variantTitle}</p>}
                        <p className="item-qty">Qtà: {item.quantity}</p>
                      </div>
                      <p className="item-price">
                        {formatMoney(item.linePriceCents || (item.priceCents || 0) * item.quantity, currency)}
                      </p>
                    </div>
                  ))}

                  {/* Upsell aggiunto */}
                  {session?.upsellStatus === "paid" && session.upsellProduct && (
                    <div className="upsell-recap">
                      {session.upsellProduct.image && (
                        <img
                          src={session.upsellProduct.image}
                          alt={session.upsellProduct.productTitle}
                          className="upsell-recap-img"
                        />
                      )}
                      <div className="upsell-recap-text">
                        <p className="upsell-recap-label">✨ Extra aggiunto</p>
                        <p className="upsell-recap-title">
                          {session.upsellProduct.productTitle}
                          {session.upsellProduct.variantTitle &&
                            session.upsellProduct.variantTitle !== "Default Title"
                            ? ` — ${session.upsellProduct.variantTitle}`
                            : ""}
                        </p>
                      </div>
                      <p className="item-price">
                        {formatMoney(session.upsellAmountCents, currency)}
                      </p>
                    </div>
                  )}

                  <div className="totals">
                    <div className="total-row">
                      <span className="label">Spedizione</span>
                      <span className="green">Gratuita</span>
                    </div>
                    <div className="total-row final">
                      <span className="label">Totale pagato</span>
                      <span className="value">
                        {formatMoney(
                          (session?.totalCents || 0) + (session?.upsellAmountCents || 0),
                          currency
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Indirizzo consegna */}
              {customer.address1 && (
                <div className="info-card" style={{ animationDelay: "0.2s" }}>
                  <p className="card-title">Indirizzo di consegna</p>
                  <p className="address-text">
                    {customer.fullName}<br />
                    {customer.address1}<br />
                    {customer.postalCode} {customer.city} ({customer.province})<br />
                    {customer.countryCode}
                  </p>
                </div>
              )}

              {/* Cosa succede ora */}
              <div className="info-card" style={{ animationDelay: "0.25s" }}>
                <p className="card-title">Cosa succede ora</p>
                <div className="steps">
                  <div className="step">
                    <div className="step-icon" style={{ background: "#eff6ff" }}>📧</div>
                    <div className="step-text">
                      <p className="step-title">Email di conferma</p>
                      <p className="step-desc">Riceverai a breve una email con il riepilogo del tuo ordine</p>
                    </div>
                  </div>
                  <div className="step">
                    <div className="step-icon" style={{ background: "#f0fdf4" }}>📦</div>
                    <div className="step-text">
                      <p className="step-title">Preparazione ordine</p>
                      <p className="step-desc">Il tuo ordine verrà preparato e spedito entro 24-48 ore</p>
                    </div>
                  </div>
                  <div className="step">
                    <div className="step-icon" style={{ background: "#fefce8" }}>🚚</div>
                    <div className="step-text">
                      <p className="step-title">Consegna Express</p>
                      <p className="step-desc">Consegna in 2-4 giorni lavorativi con tracking via email</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back to store */}
              <a href="https://oltreboutique.com" className="back-btn">
                Continua lo shopping →
              </a>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function ThankYouPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", fontFamily: "sans-serif" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e8e0d8", borderTopColor: "#22c55e", borderRadius: "50%", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, color: "#999" }}>Caricamento…</p>
          </div>
        </div>
      }
    >
      <ThankYouContent />
    </Suspense>
  )
}
