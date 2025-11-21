// src/app/api/config/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig, setConfig, AppConfig, StripeAccount, ShopifyConfig } from "@/lib/config"

export async function GET() {
  try {
    const cfg = await getConfig()

    // ✅ Normalizza stripeAccounts per garantire tutti i campi (inclusi productTitle)
    const normalizedAccounts = (cfg.stripeAccounts || []).map((acc: any, index: number) => ({
      label: acc.label || `Account ${index + 1}`,
      secretKey: "", // Non inviare al client
      publishableKey: acc.publishableKey || "",
      webhookSecret: "", // Non inviare al client
      active: acc.active ?? false,
      order: acc.order ?? index,
      merchantSite: acc.merchantSite || "",
      lastUsedAt: acc.lastUsedAt || 0,
      // ✅ Product titles
      productTitle1: acc.productTitle1 || "",
      productTitle2: acc.productTitle2 || "",
      productTitle3: acc.productTitle3 || "",
      productTitle4: acc.productTitle4 || "",
      productTitle5: acc.productTitle5 || "",
      productTitle6: acc.productTitle6 || "",
      productTitle7: acc.productTitle7 || "",
      productTitle8: acc.productTitle8 || "",
      productTitle9: acc.productTitle9 || "",
      productTitle10: acc.productTitle10 || "",
    }))

    const safeCfg = {
      ...cfg,
      stripeAccounts: normalizedAccounts,
    }

    console.log("[config GET] ✓ Config inviata al client (secrets nascosti)")
    return NextResponse.json(safeCfg)
  } catch (err: any) {
    console.error("[config GET] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel recupero config" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log("[config POST] ✓ Payload ricevuto")
    console.log("[config POST] 📦 StripeAccounts ricevuti:", body.stripeAccounts?.length || 0)

    // ✅ Shopify Config
    const shopify: ShopifyConfig = {
      shopDomain: (body.shopify?.shopDomain || body.shopifyDomain || "").trim(),
      adminToken: (body.shopify?.adminToken || body.shopifyAdminToken || "").trim(),
      apiVersion: (body.shopify?.apiVersion || "2024-10").trim(),
      storefrontToken: (body.shopify?.storefrontToken || body.shopifyStorefrontToken || "").trim(),
    }

    // ✅ Carica config esistente per preservare lastUsedAt
    const existingConfig = await getConfig()
    const existingAccounts = existingConfig.stripeAccounts || []

    // ✅ Stripe Accounts - USA SPREAD OPERATOR per preservare tutti i campi
    const stripeAccounts: StripeAccount[] = (body.stripeAccounts || [])
      .slice(0, 4)
      .map((acc: any, idx: number) => {
        const existingAccount = existingAccounts[idx]

        // ✅ FIX: Spread dell'oggetto ricevuto per preservare productTitle1-10
        const normalized: StripeAccount = {
          ...acc, // ✅ PRESERVA TUTTI I CAMPI (inclusi productTitle)
          // Poi sovrascrivi solo i campi che vuoi normalizzare
          label: (acc.label || `Account ${idx + 1}`).trim(),
          secretKey: (acc.secretKey || "").trim(),
          publishableKey: (acc.publishableKey || "").trim(),
          webhookSecret: (acc.webhookSecret || "").trim(),
          active: !!acc.active,
          order: typeof acc.order === "number" ? acc.order : idx,
          merchantSite: (acc.merchantSite || "").trim(),
          lastUsedAt: acc.lastUsedAt ?? existingAccount?.lastUsedAt ?? 0,
        }

        // Log per debug
        const productTitlesCount = [
          normalized.productTitle1,
          normalized.productTitle2,
          normalized.productTitle3,
          normalized.productTitle4,
          normalized.productTitle5,
          normalized.productTitle6,
          normalized.productTitle7,
          normalized.productTitle8,
          normalized.productTitle9,
          normalized.productTitle10,
        ].filter(Boolean).length

        console.log(`[config POST] Account ${idx} (${normalized.label}):`, {
          hasSecretKey: !!normalized.secretKey,
          hasPublishableKey: !!normalized.publishableKey,
          hasWebhook: !!normalized.webhookSecret,
          active: normalized.active,
          lastUsedAt: normalized.lastUsedAt,
          productTitlesCount, // ✅ Quanti product titles sono presenti
        })

        return normalized
      })

    // ✅ Config completa
    const newCfg: Partial<AppConfig> = {
      checkoutDomain: (body.checkoutDomain || "").trim(),
      defaultCurrency: (body.defaultCurrency || "eur").toLowerCase(),
      shopify,
      stripeAccounts,
    }

    // ✅ Salva su Firebase
    await setConfig(newCfg)

    console.log("[config POST] ✓ Configurazione salvata su Firebase")

    // ✅ Verifica salvataggio
    const verifiedConfig = await getConfig()
    const verifiedProductTitlesCount = [
      verifiedConfig.stripeAccounts?.[0]?.productTitle1,
      verifiedConfig.stripeAccounts?.[0]?.productTitle2,
      verifiedConfig.stripeAccounts?.[0]?.productTitle3,
      verifiedConfig.stripeAccounts?.[0]?.productTitle4,
      verifiedConfig.stripeAccounts?.[0]?.productTitle5,
      verifiedConfig.stripeAccounts?.[0]?.productTitle6,
      verifiedConfig.stripeAccounts?.[0]?.productTitle7,
      verifiedConfig.stripeAccounts?.[0]?.productTitle8,
      verifiedConfig.stripeAccounts?.[0]?.productTitle9,
      verifiedConfig.stripeAccounts?.[0]?.productTitle10,
    ].filter(Boolean).length

    console.log("[config POST] ✓ Verifica primo account:", {
      label: verifiedConfig.stripeAccounts?.[0]?.label,
      hasPublishableKey: !!verifiedConfig.stripeAccounts?.[0]?.publishableKey,
      lastUsedAt: verifiedConfig.stripeAccounts?.[0]?.lastUsedAt,
      productTitlesCount: verifiedProductTitlesCount, // ✅ Verifica che siano salvati
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[config POST] error:", err)
    return NextResponse.json(
      { error: err.message || "Errore nel salvataggio config" },
      { status: 500 },
    )
  }
}
