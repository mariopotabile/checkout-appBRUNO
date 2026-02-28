"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

export const dynamic = "force-dynamic"

type UpsellVariant = {
  id: string
  gid: string
  title: string
  availableForSale: boolean
  priceCents: number
  selectedOptions: { name: string; value: string }[]
  image: string | null
}

type UpsellProduct = {
  handle: string
  title: string
  image: string | null
  options: { name: string; values: string[] }[]
  variants: UpsellVariant[]
}

function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function CountdownTimer({ seconds }: { seconds: number }) {
  const [timeLeft, setTimeLeft] = useState(seconds)

  useEffect(() => {
    if (timeLeft <= 0) return
    const t = setInterval(() => setTimeLeft((p) => p - 1), 1000)
    return () => clearInterval(t)
  }, [timeLeft])

  const m = String(Math.floor(timeLeft / 60)).padStart(2, "0")
  const s = String(timeLeft % 60).padStart(2, "0")

  return (
    <span className="font-mono font-bold text-red-500">
      {m}:{s}
    </span>
  )
}

function OfferCard({
  product,
  sessionId,
  currency,
  offerIndex,
  totalOffers,
  onAccepted,
  onDeclined,
}: {
  product: UpsellProduct
  sessionId: string
  currency: string
  offerIndex: number
  totalOffers: number
  onAccepted: () => void
  onDeclined: () => void
}) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)

  // Pre-seleziona prima variante disponibile
  useEffect(() => {
    const defaults: Record<string, string> = {}
    product.options.forEach((opt) => {
      if (opt.values.length > 0) defaults[opt.name] = opt.values[0]
    })
    setSelectedOptions(defaults)
  }, [product])

  const selectedVariant = product.variants.find((v) =>
    v.selectedOptions.every((o) => selectedOptions[o.name] === o.value)
  )

  const displayImage =
    selectedVariant?.image || product.image || null

  async function handleAccept() {
    if (!selectedVariant) {
      setError("Seleziona una variante")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/upsell-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          variantId: selectedVariant.id,
          variantTitle: selectedVariant.title,
          productTitle: product.title,
          priceCents: selectedVariant.priceCents,
          image: displayImage,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Errore nel pagamento")
      onAccepted()
    } catch (err: any) {
      setError(err.message || "Errore imprevisto")
      setLoading(false)
    }
  }

  function handleDecline() {
    setDeclined(true)
    setTimeout(() => onDeclined(), 300)
  }

  const discountedPrice = selectedVariant
    ? Math.round(selectedVariant.priceCents * 0.7)
    : null
  const originalPrice = selectedVariant?.priceCents ?? null

  return (
    <div
      className={`offer-card ${declined ? "fade-out" : "fade-in"}`}
      style={{ opacity: declined ? 0 : 1, transition: "opacity 0.3s ease" }}
    >
      {/* Badge offerta */}
      <div className="offer-badge">
        <span>🎁 OFFERTA ESCLUSIVA — Solo per te</span>
      </div>

      {/* Progress */}
      <div className="progress-bar-wrap">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${((offerIndex) / totalOffers) * 100}%` }}
          />
        </div>
        <span className="progress-label">
          Offerta {offerIndex} di {totalOffers}
        </span>
      </div>

      {/* Timer */}
      <div className="timer-banner">
        ⏱ Questa offerta scade tra <CountdownTimer seconds={600} /> — solo per i nuovi clienti
      </div>

      {/* Prodotto */}
      <div className="product-layout">
        <div className="product-image-wrap">
          {displayImage ? (
            <img src={displayImage} alt={product.title} className="product-image" />
          ) : (
            <div className="product-image-placeholder">📦</div>
          )}
          <div className="badge-sale">-30%</div>
        </div>

        <div className="product-info">
          <p className="product-label">Aggiungilo al tuo ordine</p>
          <h2 className="product-title">{product.title}</h2>

          <div className="price-row">
            {discountedPrice && originalPrice && (
              <>
                <span className="price-new">{formatMoney(discountedPrice, currency)}</span>
                <span className="price-old">{formatMoney(originalPrice, currency)}</span>
                <span className="price-save">Risparmi {formatMoney(originalPrice - discountedPrice, currency)}</span>
              </>
            )}
          </div>

          {/* Opzioni */}
          {product.options.filter(o => o.name !== "Title").map((opt) => (
            <div key={opt.name} className="option-group">
              <label className="option-label">{opt.name}</label>
              <div className="option-buttons">
                {opt.values.map((val) => {
                  const variantForVal = product.variants.find((v) =>
                    v.selectedOptions.some((o) => o.name === opt.name && o.value === val) &&
                    Object.entries(selectedOptions)
                      .filter(([k]) => k !== opt.name)
                      .every(([k, v2]) =>
                        (product.variants.find(vv =>
                          vv.selectedOptions.some(o => o.name === opt.name && o.value === val) &&
                          vv.selectedOptions.some(o => o.name === k && o.value === v2)
                        ))
                      )
                  )
                  const available = variantForVal?.availableForSale !== false
                  return (
                    <button
                      key={val}
                      onClick={() => setSelectedOptions((p) => ({ ...p, [opt.name]: val }))}
                      className={`option-btn ${selectedOptions[opt.name] === val ? "selected" : ""} ${!available ? "unavailable" : ""}`}
                      disabled={!available}
                    >
                      {val}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Garanzie mini */}
          <div className="mini-guarantees">
            <span>✓ Spedizione gratuita</span>
            <span>✓ Un click, nessun reinserimento carta</span>
            <span>✓ Aggiunto al tuo ordine esistente</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* CTA */}
      <div className="cta-section">
        <button
          onClick={handleAccept}
          disabled={loading || !selectedVariant}
          className="btn-accept"
        >
          {loading ? (
            <span className="loading-dots">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </span>
          ) : (
            <>
              <span className="btn-icon">⚡</span>
              Sì! Aggiungi al mio ordine —{" "}
              {discountedPrice ? formatMoney(discountedPrice, currency) : ""}
            </>
          )}
        </button>

        <button onClick={handleDecline} className="btn-decline" disabled={loading}>
          No grazie, non voglio questa offerta esclusiva
        </button>
      </div>
    </div>
  )
}

function OfferPageContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [products, setProducts] = useState<UpsellProduct[]>([])
  const [currency, setCurrency] = useState("EUR")
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        // Carica prodotti upsell
        const [productsRes, sessionRes] = await Promise.all([
          fetch("/api/upsell-products"),
          fetch(`/api/cart-session?sessionId=${sessionId}`),
        ])
        const productsData = await productsRes.json()
        const sessionData = await sessionRes.json()

        if (productsData.products) setProducts(productsData.products)
        if (sessionData.currency) setCurrency(sessionData.currency)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    if (sessionId) load()
    else setLoading(false)
  }, [sessionId])

  function goToThankYou() {
    window.location.href = `/thank-you?sessionId=${sessionId}`
  }

  function handleAccepted() {
    setAccepted(true)
    setTimeout(() => {
      setAccepted(false)
      if (currentIndex + 1 < products.length) {
        setCurrentIndex((p) => p + 1)
      } else {
        goToThankYou()
      }
    }, 1800)
  }

  function handleDeclined() {
    if (currentIndex + 1 < products.length) {
      setCurrentIndex((p) => p + 1)
    } else {
      goToThankYou()
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Sora', sans-serif;
          background: #f5f0eb;
          min-height: 100vh;
        }

        .page-wrap {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: linear-gradient(160deg, #fdf8f3 0%, #f0e9e0 100%);
        }

        /* Header */
        .page-header {
          width: 100%;
          padding: 16px 24px;
          background: white;
          border-bottom: 1px solid #e8e0d8;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .page-header img {
          height: 36px;
          max-width: 140px;
          object-fit: contain;
        }

        /* Success overlay */
        .success-overlay {
          position: fixed;
          inset: 0;
          background: rgba(255,255,255,0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          gap: 16px;
          animation: fadeIn 0.3s ease;
        }

        .success-icon {
          width: 80px;
          height: 80px;
          background: #22c55e;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .success-text {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          text-align: center;
        }

        .success-sub {
          font-size: 14px;
          color: #666;
          text-align: center;
        }

        /* Main content */
        .main-content {
          width: 100%;
          max-width: 560px;
          padding: 24px 16px 60px;
        }

        /* Offer card */
        .offer-card {
          background: white;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.10);
        }

        .fade-in { animation: fadeIn 0.4s ease; }

        .offer-badge {
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          color: white;
          text-align: center;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .progress-bar-wrap {
          padding: 14px 20px 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .progress-bar-track {
          flex: 1;
          height: 6px;
          background: #f0e9e0;
          border-radius: 99px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          border-radius: 99px;
          transition: width 0.5s ease;
        }

        .progress-label {
          font-size: 12px;
          color: #999;
          white-space: nowrap;
          font-weight: 500;
        }

        .timer-banner {
          margin: 12px 20px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #c2410c;
          font-weight: 500;
          text-align: center;
        }

        .product-layout {
          display: flex;
          gap: 16px;
          padding: 16px 20px;
        }

        @media (max-width: 480px) {
          .product-layout { flex-direction: column; }
        }

        .product-image-wrap {
          position: relative;
          flex-shrink: 0;
          width: 140px;
          height: 140px;
        }

        @media (max-width: 480px) {
          .product-image-wrap { width: 100%; height: 220px; }
        }

        .product-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 16px;
        }

        .product-image-placeholder {
          width: 100%;
          height: 100%;
          background: #f0e9e0;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
        }

        .badge-sale {
          position: absolute;
          top: -8px;
          right: -8px;
          background: #ef4444;
          color: white;
          font-size: 12px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 99px;
          box-shadow: 0 2px 8px rgba(239,68,68,0.4);
        }

        .product-info { flex: 1; }

        .product-label {
          font-size: 12px;
          font-weight: 600;
          color: #f59e0b;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .product-title {
          font-size: 18px;
          font-weight: 700;
          color: #1a1a1a;
          line-height: 1.3;
          margin-bottom: 10px;
        }

        .price-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .price-new {
          font-size: 22px;
          font-weight: 800;
          color: #1a1a1a;
        }

        .price-old {
          font-size: 15px;
          color: #aaa;
          text-decoration: line-through;
        }

        .price-save {
          font-size: 12px;
          font-weight: 700;
          color: white;
          background: #22c55e;
          padding: 2px 8px;
          border-radius: 99px;
        }

        .option-group { margin-bottom: 12px; }

        .option-label {
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
          display: block;
        }

        .option-buttons { display: flex; gap: 6px; flex-wrap: wrap; }

        .option-btn {
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Sora', sans-serif;
          border: 2px solid #e8e0d8;
          border-radius: 8px;
          background: white;
          color: #333;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .option-btn:hover:not(:disabled) {
          border-color: #1a1a1a;
        }

        .option-btn.selected {
          border-color: #1a1a1a;
          background: #1a1a1a;
          color: white;
        }

        .option-btn.unavailable {
          opacity: 0.35;
          cursor: not-allowed;
          text-decoration: line-through;
        }

        .mini-guarantees {
          display: flex;
          flex-direction: column;
          gap: 3px;
          margin-top: 10px;
        }

        .mini-guarantees span {
          font-size: 12px;
          color: #555;
        }

        .error-banner {
          margin: 0 20px 12px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #dc2626;
        }

        .cta-section {
          padding: 16px 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .btn-accept {
          width: 100%;
          padding: 18px 24px;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Sora', sans-serif;
          color: white;
          background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
          border: none;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px rgba(245,158,11,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 58px;
        }

        .btn-accept:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(245,158,11,0.45);
        }

        .btn-accept:active:not(:disabled) { transform: translateY(0); }

        .btn-accept:disabled {
          background: #d1d5db;
          box-shadow: none;
          cursor: not-allowed;
        }

        .btn-icon { font-size: 18px; }

        .btn-decline {
          background: none;
          border: none;
          color: #aaa;
          font-size: 12px;
          font-family: 'Sora', sans-serif;
          cursor: pointer;
          text-decoration: underline;
          padding: 6px;
          transition: color 0.15s;
        }

        .btn-decline:hover { color: #666; }

        /* Loading */
        .loading-dots { display: flex; gap: 4px; align-items: center; }
        .dot {
          width: 8px; height: 8px;
          background: white;
          border-radius: 50%;
          animation: bounce 0.6s infinite alternate;
        }
        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        /* Loading state */
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
          border-top-color: #f59e0b;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }
        @keyframes bounce { from { transform: translateY(0); } to { transform: translateY(-6px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="page-wrap">
        <header className="page-header">
          <img
            src="https://cdn.shopify.com/s/files/1/0927/1902/2465/files/LOGO_NIMEA.png?v=1771617668"
            alt="Nimea"
          />
        </header>

        {/* Success overlay */}
        {accepted && (
          <div className="success-overlay">
            <div className="success-icon">✓</div>
            <p className="success-text">Aggiunto al tuo ordine!</p>
            <p className="success-sub">Ottima scelta 🎉</p>
          </div>
        )}

        <div className="main-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p style={{ fontSize: 14, color: "#999" }}>Caricamento offerta…</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p>
              <button
                onClick={() => window.location.href = `/thank-you?sessionId=${sessionId}`}
                style={{ color: "#666", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", fontFamily: "Sora, sans-serif" }}
              >
                Vai alla conferma ordine →
              </button>
            </div>
          ) : products.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              {typeof window !== "undefined" && (window.location.href = `/thank-you?sessionId=${sessionId}`)}
            </div>
          ) : currentIndex < products.length ? (
            <OfferCard
              key={currentIndex}
              product={products[currentIndex]}
              sessionId={sessionId}
              currency={currency}
              offerIndex={currentIndex + 1}
              totalOffers={products.length}
              onAccepted={handleAccepted}
              onDeclined={handleDeclined}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}

export default function OfferPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e8e0d8", borderTopColor: "#f59e0b", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, color: "#999" }}>Caricamento…</p>
          </div>
        </div>
      }
    >
      <OfferPageContent />
    </Suspense>
  )
}
