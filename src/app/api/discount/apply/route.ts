// src/app/api/discount/apply/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const code = body?.code as string | undefined
    const sessionId = body?.sessionId as string | undefined

    if (!code || !code.trim()) {
      return NextResponse.json(
        { ok: false, error: "Codice mancante." },
        { status: 400 },
      )
    }

    // 🔧 Prendiamo i dati Shopify da Firestore (config globale)
    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain?.trim()
    const adminToken = cfg.shopify?.adminToken?.trim()
    const apiVersion = cfg.shopify?.apiVersion?.trim() || "2024-10"

    if (!shopDomain || !adminToken) {
      console.error(
        "[/api/discount/apply] Config Shopify mancante. shopDomain/adminToken vuoti.",
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Configurazione Shopify mancante sul server. Controlla l'onboarding.",
        },
        { status: 500 },
      )
    }

    const normalizedCode = code.trim()

    const baseUrl = `https://${shopDomain}/admin/api/${apiVersion}`

    // 1) Lookup del codice sconto
    const lookupUrl = `${baseUrl}/discount_codes/lookup.json?code=${encodeURIComponent(
      normalizedCode,
    )}`

    const commonHeaders = {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    let lookupRes = await fetch(lookupUrl, {
      method: "GET",
      headers: commonHeaders,
    })

    // Shopify può rispondere con 303 e Location verso /price_rules/.../discount_codes/...
    if (lookupRes.status === 303) {
      const location = lookupRes.headers.get("location")
      if (!location) {
        console.error(
          "[discount lookup] 303 senza Location header. Impossibile seguire redirect.",
        )
        return NextResponse.json(
          {
            ok: false,
            error: "Errore nella lettura del codice sconto da Shopify.",
          },
          { status: 500 },
        )
      }

      const redirectUrl = location.startsWith("http")
        ? location
        : `https://${shopDomain}${location}`

      lookupRes = await fetch(redirectUrl, {
        method: "GET",
        headers: commonHeaders,
      })
    }

    if (!lookupRes.ok) {
      if (lookupRes.status === 404) {
        return NextResponse.json(
          { ok: false, error: "Codice sconto non valido o non attivo." },
          { status: 404 },
        )
      }

      const txt = await lookupRes.text().catch(() => "")
      console.error(
        "[discount lookup] Errore:",
        lookupRes.status,
        txt.slice(0, 300),
      )
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel contatto con Shopify (lookup codice).",
        },
        { status: 500 },
      )
    }

    const lookupJson = await lookupRes.json().catch(() => ({} as any))
    const discountCode = lookupJson?.discount_code

    if (!discountCode?.price_rule_id) {
      // Se per qualche motivo la risposta non contiene la struttura attesa
      console.error(
        "[discount lookup] Nessun price_rule_id nella risposta:",
        JSON.stringify(lookupJson).slice(0, 400),
      )
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o scaduto." },
        { status: 400 },
      )
    }

    const priceRuleId = discountCode.price_rule_id

    // 2) Recupera la price rule per capire tipo e valore
    const prUrl = `${baseUrl}/price_rules/${priceRuleId}.json`
    const prRes = await fetch(prUrl, {
      method: "GET",
      headers: commonHeaders,
    })

    if (!prRes.ok) {
      const txt = await prRes.text().catch(() => "")
      console.error("[price_rule] Errore:", prRes.status, txt.slice(0, 300))
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel recupero della regola di sconto da Shopify.",
        },
        { status: 500 },
      )
    }

    const prJson = await prRes.json().catch(() => ({} as any))
    const priceRule = prJson?.price_rule

    if (!priceRule) {
      return NextResponse.json(
        {
          ok: false,
          error: "Regola di sconto non trovata o non più valida.",
        },
        { status: 400 },
      )
    }

    const valueType = priceRule.value_type as
      | "percentage"
      | "fixed_amount"
      | "shipping"
    const rawValue = Number(priceRule.value) // es. "-10.0" per 10%
    const absValue = Math.abs(rawValue)

    // Per ora supportiamo solo sconti in percentuale
    if (valueType !== "percentage") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto non è di tipo percentuale. Al momento sono supportati solo sconti in percentuale.",
        },
        { status: 400 },
      )
    }

    // ✅ Risposta pulita per il frontend
    return NextResponse.json(
      {
        ok: true,
        code: discountCode.code,
        valueType, // "percentage"
        percentValue: absValue, // es. 10
        priceRuleId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/discount/apply] Errore:", err)
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Errore interno applicazione sconto.",
      },
      { status: 500 },
    )
  }
}