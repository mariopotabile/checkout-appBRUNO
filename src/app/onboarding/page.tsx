// src/app/onboarding/page.tsx
"use client";

import { useState } from "react";

type StripeAccountInput = {
  label: string;
  name: string;
};

const STRIPE_ACCOUNTS: StripeAccountInput[] = [
  { label: "Account 1", name: "account1" },
  { label: "Account 2", name: "account2" },
  { label: "Account 3", name: "account3" },
  { label: "Account 4", name: "account4" },
];

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    setError(null);

    const formData = new FormData(e.currentTarget);

    const payload = {
      shopify: {
        shopDomain: (formData.get("shopifyDomain") as string) || "",
        adminToken: (formData.get("shopifyAdminToken") as string) || "",
        storefrontToken:
          (formData.get("shopifyStorefrontToken") as string) || "",
        apiVersion: "2024-10",
      },

      stripeAccounts: STRIPE_ACCOUNTS.map((acc, index) => ({
        label:
          ((formData.get(`${acc.name}-label`) as string) ||
            acc.label) ?? `Account ${index + 1}`,
        secretKey: ((formData.get(`${acc.name}-secret`) as string) || "").trim(),
        publishableKey: ((formData.get(`${acc.name}-publishable`) as string) || "").trim(),
        webhookSecret:
          ((formData.get(`${acc.name}-webhook`) as string) || "").trim(),
        active: formData.get(`${acc.name}-active`) === "on",
        order: index,
        merchantSite:
          ((formData.get(`${acc.name}-merchantSite`) as string) || "").trim(),
        lastUsedAt: 0,
      })),

      defaultCurrency: (
        (formData.get("defaultCurrency") as string) ||
        "eur"
      ).toLowerCase(),
      checkoutDomain:
        (typeof window !== "undefined" ? window.location.origin : "") || "",
    };

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Errore salvataggio configurazione");
      }

      setSaved(true);
    } catch (err: any) {
      setError(err.message ?? "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
      <div className="max-w-6xl w-full space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-slate-300 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Setup iniziale • Checkout Hub
            </div>
            <h1 className="mt-4 text-3xl md:text-4xl font-semibold tracking-tight text-slate-50">
              Collega Shopify, Stripe e Firebase
            </h1>
            <p className="mt-2 text-sm text-slate-400 max-w-xl">
              Configura una sola volta, poi il tuo checkout custom gestirà in
              automatico carrelli, pagamenti multi-account Stripe e
              sincronizzazione ordini.
            </p>
          </div>

          <div className="glass-card px-4 py-3 flex flex-col gap-1 md:w-72">
            <p className="text-xs font-medium text-slate-300">
              Stato onboarding
            </p>
            <p className="text-sm text-slate-400">
              Completa i campi essenziali e salva la configurazione. I dati
              vengono memorizzati in Firebase e riutilizzati dal backend.
            </p>
          </div>
        </header>

        {/* Layout principale */}
        <form
          onSubmit={handleSubmit}
          className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start"
        >
          {/* Colonna sinistra: Shopify + Stripe */}
          <div className="space-y-6">
            {/* Shopify card */}
            <section className="glass-card p-6 md:p-7 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="glass-label">Sorgente carrelli</p>
                  <h2 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
                    Shopify
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                      Live ready
                    </span>
                  </h2>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Usa app privata + Storefront API</p>
                  <p>Scoped solo a ordini & prodotti</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="glass-label">Shopify Store Domain</label>
                  <input
                    name="shopifyDomain"
                    className="glass-input"
                    placeholder="es. imjsqk-my.myshopify.com"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Admin API Token</label>
                  <input
                    name="shopifyAdminToken"
                    type="password"
                    className="glass-input"
                    placeholder="shpat_********"
                    required
                  />
                </div>

                <div>
                  <label className="glass-label">Storefront API Token</label>
                  <input
                    name="shopifyStorefrontToken"
                    type="password"
                    className="glass-input"
                    placeholder="Storefront token per leggere il carrello/prodotti"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="glass-label">Valuta di default</label>
                    <input
                      name="defaultCurrency"
                      className="glass-input"
                      defaultValue="EUR"
                      placeholder="EUR"
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-end">
                    Usata se il carrello non espone una currency esplicita.
                  </div>
                </div>
              </div>
            </section>

            {/* Stripe accounts card */}
            <section className="glass-card p-6 md:p-7 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="glass-label">Gateway di pagamento</p>
                  <h2 className="text-lg font-semibold text-slate-50 flex items-center gap-2">
                    Stripe multi-account
                  </h2>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Fino a 4 account Stripe</p>
                  <p>Rotazione automatica ogni 6 ore</p>
                </div>
              </div>

              <div className="grid gap-4">
                {STRIPE_ACCOUNTS.map((acc, index) => (
                  <div
                    key={acc.name}
                    className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-200">
                          {acc.label}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Opzionale. Puoi anche usarne solo uno.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          name={`${acc.name}-active`}
                          defaultChecked={index === 0}
                          className="h-3.5 w-3.5 rounded border-white/30 bg-slate-900/60"
                        />
                        Attivo
                      </label>
                    </div>

                    <div className="grid gap-3">
                      <div>
                        <label className="glass-label">Label interna</label>
                        <input
                          name={`${acc.name}-label`}
                          className="glass-input"
                          placeholder={`es. Stripe NFR ${index + 1}`}
                        />
                      </div>

                      <div>
                        <label className="glass-label">Secret Key</label>
                        <input
                          name={`${acc.name}-secret`}
                          type="password"
                          className="glass-input"
                          placeholder="sk_live_*** o sk_test_***"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          📍 Stripe Dashboard → Developers → API keys → Secret key
                        </p>
                      </div>

                      <div>
                        <label className="glass-label">Publishable Key</label>
                        <input
                          name={`${acc.name}-publishable`}
                          type="text"
                          className="glass-input"
                          placeholder="pk_live_*** o pk_test_***"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          📍 Stripe Dashboard → Developers → API keys → Publishable key
                        </p>
                      </div>

                      <div>
                        <label className="glass-label">
                          Webhook Secret{" "}
                          <span className="text-[10px] font-normal text-amber-400">
                            (Richiesto per ordini automatici)
                          </span>
                        </label>
                        <input
                          name={`${acc.name}-webhook`}
                          type="password"
                          className="glass-input"
                          placeholder="whsec_***"
                        />
                        <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                          <p className="font-medium text-slate-400">📍 Come ottenerlo:</p>
                          <ol className="list-decimal list-inside space-y-0.5 pl-2">
                            <li>Stripe Dashboard → Developers → Webhooks</li>
                            <li>Click "Add endpoint"</li>
                            <li>URL: <code className="text-emerald-400">https://tuo-dominio.vercel.app/api/webhooks/stripe</code></li>
                            <li>Eventi: seleziona <code className="text-emerald-400">payment_intent.succeeded</code></li>
                            <li>Copia il "Signing secret" (inizia con whsec_)</li>
                          </ol>
                        </div>
                      </div>

                      <div>
                        <label className="glass-label">
                          Merchant site (per metadata / descriptor)
                        </label>
                        <input
                          name={`${acc.name}-merchantSite`}
                          className="glass-input"
                          placeholder="es. https://notforresale.it"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Colonna destra: Firebase + azioni */}
          <aside className="space-y-4">
            {/* Firebase info */}
            <section className="glass-card p-5 md:p-6 space-y-3">
              <p className="glass-label">Storage configurazione</p>
              <h2 className="text-base font-semibold text-slate-50 flex items-center gap-2">
                Firebase Firestore
              </h2>
              <p className="text-sm text-slate-400">
                I dati inseriti qui vengono salvati su Firestore (collezione
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-black/40 border border-white/5 ml-1">
                  config/global
                </span>
                ) e letti dalle API:
              </p>
              <ul className="text-[11px] text-slate-400 space-y-1.5">
                <li>
                  • <code className="font-mono">/api/cart-session</code>
                </li>
                <li>
                  • <code className="font-mono">/api/payment-intent</code>
                </li>
                <li>
                  • <code className="font-mono">/api/webhooks/stripe</code>
                </li>
                <li>
                  • <code className="font-mono">/api/discount/apply</code>
                </li>
              </ul>
            </section>

            {/* Guida Webhook */}
            <section className="glass-card p-5 md:p-6 space-y-3 bg-amber-950/20 border-amber-500/30">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚡</span>
                <h3 className="text-sm font-semibold text-amber-300">
                  Webhook Setup Importante
                </h3>
              </div>
              <p className="text-[11px] text-slate-300">
                Il webhook secret è necessario per creare automaticamente ordini su Shopify dopo il pagamento.
              </p>
              <div className="text-[11px] text-slate-400 space-y-2">
                <p className="font-medium text-slate-300">Endpoint webhook:</p>
                <code className="block bg-black/40 border border-white/10 rounded px-2 py-1.5 text-emerald-400 break-all">
                  {typeof window !== "undefined" ? window.location.origin : "https://tuo-dominio.vercel.app"}/api/webhooks/stripe
                </code>
                <p className="mt-2">
                  ⚠️ Configura questo endpoint su <strong>ogni</strong> account Stripe attivo.
                </p>
              </div>
            </section>

            {/* Stato + pulsanti */}
            <section className="glass-card p-5 md:p-6 space-y-4">
              {error && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-[11px] text-rose-100">
                  {error}
                </div>
              )}
              {saved && !error && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/60 px-3 py-2 text-[11px] text-emerald-100">
                  ✓ Configurazione salvata correttamente.
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="submit"
                  className="glass-button-primary w-full"
                  disabled={loading}
                >
                  {loading ? "Salvataggio in corso…" : "Salva configurazione"}
                </button>
                <button
                  type="button"
                  className="glass-button w-full text-xs"
                  onClick={() => window.open("/checkout", "_blank")}
                >
                  Apri anteprima checkout
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Puoi modificare questi valori in qualsiasi momento. Le nuove
                config verranno usate dalle prossime sessioni di checkout.
              </p>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}
