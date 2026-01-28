// src/app/api/discount/apply/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"
import { getShopifyAccessToken } from "@/lib/shopifyAuth"

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

    const cfg = await getConfig()
    const shopDomain = cfg.shopify?.shopDomain
    const apiVersion = cfg.shopify?.apiVersion || "2024-10"

    // ✅ USA IL NUOVO SISTEMA OAUTH
    const adminToken = await getShopifyAccessToken(
      cfg.shopify.clientId,
      cfg.shopify.clientSecret,
      cfg.shopify.shopDomain
    )

    if (!shopDomain || !adminToken) {
      console.error(
        "[/api/discount/apply] Config Shopify mancante:",
        shopDomain,
        !!adminToken,
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

    const lookupUrl = `${baseUrl}/discount_codes/lookup.json?code=${encodeURIComponent(
      normalizedCode,
    )}`

    const commonHeaders = {
      "X-Shopify-Access-Token": adminToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    // 🔎 1) LOOKUP CODICE — Shopify risponde 303 con Location
    const lookupRes = await fetch(lookupUrl, {
      method: "GET",
      headers: commonHeaders,
      redirect: "manual",
    })

    if (lookupRes.status === 404) {
      // codice inesistente / non attivo
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o non attivo." },
        { status: 404 },
      )
    }

    let discountCode: any = null
    let priceRuleId: string | number | null = null

    if (lookupRes.status === 303) {
      const location = lookupRes.headers.get("location")

      if (!location) {
        console.error(
          "[discount lookup] 303 ma senza Location header, raw:",
          await lookupRes.text().catch(() => ""),
        )
        return NextResponse.json(
          {
            ok: false,
            error:
              "Errore nella lettura del codice sconto da Shopify (redirect mancante).",
          },
          { status: 500 },
        )
      }

      // può essere assoluto o relativo
      const followUrl = location.startsWith("http")
        ? location
        : `https://${shopDomain}${location}`

      // Proviamo a estrarre il price_rule_id dall'URL
      const m = followUrl.match(/price_rules\/(\d+)\/discount_codes\/(\d+)/)
      if (m) {
        priceRuleId = m[1]
      }

      const followRes = await fetch(followUrl, {
        method: "GET",
        headers: commonHeaders,
      })

      if (!followRes.ok) {
        const txt = await followRes.text().catch(() => "")
        console.error(
          "[discount lookup follow] Errore:",
          followRes.status,
          txt,
        )
        return NextResponse.json(
          {
            ok: false,
            error:
              "Errore nella lettura del codice sconto da Shopify (redirect).",
          },
          { status: 500 },
        )
      }

      const followJson = await followRes.json().catch((e) => {
        console.error("[discount lookup follow] JSON error:", e)
        return null
      })

      discountCode =
        followJson?.discount_code || followJson?.discountCode || null

      // se nel JSON c'è price_rule_id, lo usiamo; altrimenti teniamo quello estratto dall'URL
      if (discountCode?.price_rule_id) {
        priceRuleId = discountCode.price_rule_id
      }
    } else if (lookupRes.ok) {
      // Scenario "vecchio": Shopify risponde 200 con il discount_code direttamente
      const lookupJson = await lookupRes.json().catch((e) => {
        console.error("[discount lookup json] error:", e)
        return null
      })
      discountCode =
        lookupJson?.discount_code || lookupJson?.discountCode || null
      priceRuleId = discountCode?.price_rule_id || null
    } else {
      const txt = await lookupRes.text().catch(() => "")
      console.error(
        "[discount lookup] Errore generico:",
        lookupRes.status,
        txt,
      )
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel contatto con Shopify (lookup codice).",
        },
        { status: 500 },
      )
    }

    if (!discountCode) {
      console.error("[discount lookup] Nessun discountCode nel JSON finale.")
      return NextResponse.json(
        { ok: false, error: "Codice sconto non valido o scaduto." },
        { status: 400 },
      )
    }

    if (!priceRuleId) {
      console.error(
        "[discount lookup] Nessun price_rule_id (né in JSON né in URL), discountCode:",
        discountCode,
      )
      return NextResponse.json(
        {
          ok: false,
          error:
            "Impossibile associare una regola di sconto. Controlla la configurazione del codice in Shopify.",
        },
        { status: 400 },
      )
    }

    // 🔎 2) PRICE RULE → tipo e valore
    const prUrl = `${baseUrl}/price_rules/${priceRuleId}.json`
    const prRes = await fetch(prUrl, {
      method: "GET",
      headers: commonHeaders,
    })

    if (!prRes.ok) {
      const txt = await prRes.text().catch(() => "")
      console.error("[price_rule] Errore:", prRes.status, txt)
      return NextResponse.json(
        {
          ok: false,
          error: "Errore nel recupero della regola di sconto da Shopify.",
        },
        { status: 500 },
      )
    }

    const prJson = await prRes.json().catch((e) => {
      console.error("[price_rule json] error:", e)
      return null
    })

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
    const rawValue = Number(priceRule.value) // es. "-10.0"
    const absValue = Math.abs(rawValue)

    if (valueType !== "percentage") {
      // per adesso supportiamo solo % (come avevamo impostato il frontend)
      return NextResponse.json(
        {
          ok: false,
          error:
            "Questo codice sconto non è di tipo percentuale. Al momento sono supportati solo sconti percentuali.",
        },
        { status: 400 },
      )
    }

    // ✅ TUTTO OK → ritorniamo info semplici al frontend
    return NextResponse.json(
      {
        ok: true,
        code: discountCode.code || normalizedCode,
        valueType, // "percentage"
        percentValue: absValue, // numero positivo (es. 10)
        priceRuleId,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error("[/api/discount/apply] Errore:", err)
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message ||
          "Errore interno nell'applicazione del codice sconto.",
      },
      { status: 500 },
    )
  }
}
