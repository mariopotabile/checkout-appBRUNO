"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

export const dynamic = "force-dynamic"

const UPSELL_PRICE_CENTS = 2990
const UPSELL_PRICE_DISPLAY = "€29,90"
const PRODUCT_TITLE = "Nimea™ Silhouette – Cintura Modellante"
const PRODUCT_SUBTITLE = "3 Pacchi + 2 Gratis — Scorta per 5 Mesi"
const VARIANT_TITLE = "3 Pacchi + 2 Gratis"

function CountdownTimer() {
  const [secs, setSecs] = useState(479)
  useEffect(() => {
    if (secs <= 0) return
    const t = setInterval(() => setSecs(s => s - 1), 1000)
    return () => clearInterval(t)
  }, [secs])
  const m = String(Math.floor(secs / 60)).padStart(2, "0")
  const s = String(secs % 60).padStart(2, "0")
  return <span className="countdown">{m}:{s}</span>
}

function SpecialOffer2Content() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("sessionId") || ""

  const [productImage, setProductImage] = useState<string | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProduct() {
      try {
        const res = await fetch("/api/upsell-products")
        const data = await res.json()
        // Secondo prodotto (index 1)
        const product = data?.products?.[1]
        if (product) {
          setProductImage(product.image)
          const variant = product.variants?.find((v: any) =>
            v.title?.toLowerCase().includes("3") ||
            v.title?.toLowerCase().includes("gratis")
          ) || product.variants?.[product.variants.length - 1]
          if (variant) setVariantId(variant.id)
        }
      } catch (_) {}
      finally { setPageLoading(false) }
    }
    loadProduct()
  }, [])

  function goToThankYou() {
    window.location.href = `/thank-you?sessionId=${sessionId}`
  }

  async function handleYes() {
    if (!variantId) {
      goToThankYou()
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
          variantId,
          variantTitle: VARIANT_TITLE,
          productTitle: PRODUCT_TITLE,
          priceCents: UPSELL_PRICE_CENTS,
          image: productImage,
          upsellIndex: 2,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Pagamento non riuscito")
      setSuccess(true)
      setTimeout(() => goToThankYou(), 2000)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: #fdf6f0;
          min-height: 100vh;
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: linear-gradient(180deg, #fdf6f0 0%, #faeee6 100%);
        }

        .header {
          width: 100%;
          background: #fff;
          border-bottom: 1px solid #f0e6df;
          padding: 14px 20px;
          display: flex;
          justify-content: center;
        }

        .header img { height: 32px; object-fit: contain; }

        .top-banner {
          width: 100%;
          background: linear-gradient(90deg, #c9a482, #b8835a);
          color: #fff;
          text-align: center;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 600;
        }

        .countdown {
          font-size: 15px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 6px;
          margin-left: 4px;
        }

        .main {
          width: 100%;
          max-width: 500px;
          padding: 28px 16px 60px;
        }

        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 24px;
        }

        .step-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #e0d4cc;
          transition: all 0.3s ease;
        }

        .step-dot.done {
          background: #22c55e;
        }

        .step-dot.active {
          background: #b8835a;
          width: 28px;
          border-radius: 5px;
        }

        .card {
          background: #fff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 8px 48px rgba(180,120,80,0.12);
          animation: slideUp 0.4s cubic-bezier(0.34,1.2,0.64,1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .offer-tag {
          background: linear-gradient(90deg, #b8835a, #c9a482);
          color: #fff;
          text-align: center;
          padding: 12px 20px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .product-img-wrap {
          width: 100%;
          height: 260px;
          background: #fdf6f0;
          overflow: hidden;
        }

        .product-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .product-img-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 64px;
          background: linear-gradient(135deg, #fdf6f0, #faeee6);
        }

        .card-body { padding: 24px 24px 0; }

        .eyebrow {
          font-size: 12px;
          font-weight: 700;
          color: #b8835a;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 6px;
        }

        .product-name {
          font-size: 22px;
          font-weight: 800;
          color: #1a1108;
          line-height: 1.25;
          margin-bottom: 6px;
        }

        .product-variant-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fdf6f0;
          border: 1px solid #e8d5c4;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          color: #7a4f2e;
          margin-bottom: 18px;
        }

        .price-block {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 18px;
        }

        .price-main {
          font-size: 34px;
          font-weight: 800;
          color: #1a1108;
        }

        .price-label {
          font-size: 14px;
          color: #999;
        }

        .bullets {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 24px;
        }

        .bullet {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          color: #4a3728;
        }

        .bullet-icon {
          width: 22px;
          height: 22px;
          background: #fdf0e8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          flex-shrink: 0;
        }

        .error-box {
          background: #fff0f0;
          border: 1px solid #fecaca;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: #dc2626;
          margin: 0 24px 12px;
        }

        .cta-wrap {
          padding: 0 24px 28px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
        }

        .btn-yes {
          width: 100%;
          padding: 19px 24px;
          background: #1a1108;
          color: #fff;
          border: none;
          border-radius: 14px;
          font-size: 17px;
          font-weight: 700;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 60px;
          box-shadow: 0 6px 24px rgba(26,17,8,0.25);
        }

        .btn-yes:hover:not(:disabled) {
          background: #2d1f0f;
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(26,17,8,0.3);
        }

        .btn-yes:disabled { background: #ccc; box-shadow: none; cursor: not-allowed; }

        .btn-price {
          background: rgba(255,255,255,0.15);
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 15px;
        }

        .btn-no {
          background: none;
          border: none;
          color: #bbb;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          text-decoration: underline;
          padding: 6px;
          text-align: center;
          transition: color 0.15s;
        }

        .btn-no:hover { color: #888; }

        .success-overlay {
          position: fixed;
          inset: 0;
          background: rgba(255,252,249,0.96);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          gap: 16px;
          animation: fadeIn 0.3s ease;
        }

        .success-circle {
          width: 88px; height: 88px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
          box-shadow: 0 8px 32px rgba(34,197,94,0.35);
          animation: pop 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }

        .success-title { font-size: 24px; font-weight: 800; color: #1a1108; }
        .success-sub { font-size: 14px; color: #888; }

        .dots { display: flex; gap: 5px; align-items: center; }
        .dot { width: 8px; height: 8px; background: #fff; border-radius: 50%; animation: bounce 0.5s infinite alternate; }
        .dot:nth-child(2) { animation-delay: 0.15s; }
        .dot:nth-child(3) { animation-delay: 0.3s; }

        .page-loader {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 14px;
          padding: 80px 20px;
        }

        .spinner {
          width: 36px; height: 36px;
          border: 3px solid #f0e6df;
          border-top-color: #b8835a;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { transform: scale(0) } to { transform: scale(1) } }
        @keyframes bounce { from { transform: translateY(0) } to { transform: translateY(-7px) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div className="page">
        <header className="header">
          <img
            src="https://cdn.shopify.com/s/files/1/0927/1902/2465/files/LOGO_NIMEA.png?v=1771617668"
            alt="Nimea"
          />
        </header>

        <div className="top-banner">
          ⏳ Ultima offerta — scade tra <CountdownTimer />
        </div>

        {success && (
          <div className="success-overlay">
            <div className="success-circle">✓</div>
            <p className="success-title">Aggiunto al tuo ordine!</p>
            <p className="success-sub">Vai al riepilogo…</p>
          </div>
        )}

        <div className="main">
          {pageLoading ? (
            <div className="page-loader">
              <div className="spinner" />
              <p style={{ fontSize: 13, color: "#b8835a", fontWeight: 500 }}>Caricamento…</p>
            </div>
          ) : (
            <>
              <div className="step-indicator">
                <div className="step-dot done" />
                <div className="step-dot active" />
                <div className="step-dot" />
              </div>

              <div className="card">
                <div className="offer-tag">⚡ Ultima Offerta Esclusiva</div>

                <div className="product-img-wrap">
                  {productImage ? (
                    <img src={productImage} alt={PRODUCT_TITLE} className="product-img" />
                  ) : (
                    <div className="product-img-placeholder">🏋️</div>
                  )}
                </div>

                <div className="card-body">
                  <p className="eyebrow">Completa il tuo percorso</p>
                  <h1 className="product-name">{PRODUCT_TITLE}</h1>

                  <div className="product-variant-badge">
                    ✨ {PRODUCT_SUBTITLE}
                  </div>

                  <div className="price-block">
                    <span className="price-main">{UPSELL_PRICE_DISPLAY}</span>
                    <span className="price-label">un click · spedizione gratuita</span>
                  </div>

                  <div className="bullets">
                    <div className="bullet">
                      <div className="bullet-icon">⚡</div>
                      <span>Aggiunto direttamente al tuo ordine</span>
                    </div>
                    <div className="bullet">
                      <div className="bullet-icon">🚚</div>
                      <span>Spedito insieme al tuo acquisto</span>
                    </div>
                    <div className="bullet">
                      <div className="bullet-icon">🔒</div>
                      <span>Nessun reinserimento della carta</span>
                    </div>
                  </div>
                </div>

                {error && <div className="error-box">⚠️ {error}</div>}

                <div className="cta-wrap">
                  <button
                    className="btn-yes"
                    onClick={handleYes}
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="dots">
                        <div className="dot" /><div className="dot" /><div className="dot" />
                      </div>
                    ) : (
                      <>
                        Sì, lo voglio!
                        <span className="btn-price">{UPSELL_PRICE_DISPLAY}</span>
                      </>
                    )}
                  </button>

                  <button className="btn-no" onClick={handleYes} disabled={loading}>
                    No grazie, voglio rinunciare a questa offerta
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default function SpecialOffer2() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fdf6f0" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #f0e6df", borderTopColor: "#b8835a", borderRadius: "50%" }} />
      </div>
    }>
      <SpecialOffer2Content />
    </Suspense>
  )
}
