// src/app/api/shipping/route.ts
import { NextRequest, NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

type ShippingItem = {
  quantity: number
  grams?: number
}

type ShippingRequest = {
  address: {
    country: string
    province?: string
    zip?: string
    city?: string
  }
  items: ShippingItem[]
  currency?: string
  // opzionale: subtotale in centesimi per eventuale soglia "spedizione gratis"
  subtotalCents?: number
}

/**
 * Per ora: calcolo spedizione MOCK (flat rate),
 * ma il file è già allineato a Firebase + AppConfig,
 * così dopo possiamo sostituire con chiamata reale all'API Shopify.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ShippingRequest
    const { address, items, currency, subtotalCents } = body

    if (!address || !items || !items.length) {
      return NextResponse.json(
        { error: "Missing address or items" },
        { status: 400 },
      )
    }

    const cfg = await getConfig()

    // ✅ lettura corretta da AppConfig.shopify
    const domain =
      cfg.shopify.shopDomain ||
      process.env.SHOPIFY_STORE_DOMAIN ||
      process.env.SHOPIFY_SHOP_DOMAIN ||
      ""

    // ✅ AGGIORNATO: clientId e clientSecret (pronti per OAuth quando servirà)
    const clientId = cfg.shopify.clientId || process.env.SHOPIFY_CLIENT_ID || ""
    const clientSecret = cfg.shopify.clientSecret || process.env.SHOPIFY_CLIENT_SECRET || ""

    const apiVersion =
      cfg.shopify.apiVersion || process.env.SHOPIFY_API_VERSION || "2024-10"

    // (per ora non usiamo ancora domain/clientId/clientSecret/apiVersion,
    //  ma sono pronti quando facciamo la chiamata vera a Shopify con OAuth)

    // ✅ valuta: usa quella passata o default da config
    const usedCurrency =
      (currency || cfg.defaultCurrency || "eur").toLowerCase()

    // peso totale (se in futuro vogliamo usare fasce di peso)
    const totalWeightGrams = items.reduce(
      (sum, it) => sum + (it.grams || 0) * (it.quantity || 1),
      0,
    )

    // ---- LOGICA MOCK DI SPEDIZIONE (puoi cambiare le cifre) ----
    // Base Italia: 4,90 €
    // Estero (country != IT): 9,90 €
    let amountCents = 490

    if (address.country && address.country.toUpperCase() !== "IT") {
      amountCents = 990
    }

    // Soglia spedizione gratuita (es. >= 79€)
    const freeThresholdCents = Number(
      process.env.SHIPPING_FREE_THRESHOLD_CENTS || "0",
    )

    if (
      freeThresholdCents > 0 &&
      typeof subtotalCents === "number" &&
      subtotalCents >= freeThresholdCents
    ) {
      amountCents = 0
    }
    // -----------------------------------------------------------

    return NextResponse.json({
      success: true,
      amount: amountCents,
      currency: usedCurrency.toUpperCase(), // es. "EUR"
      source: "mock", // in futuro: "shopify"
      debug: {
        domain,
        apiVersion,
      },
    })
  } catch (err) {
    console.error("[shipping] error:", err)
    return NextResponse.json(
      { error: "Errore nel calcolo della spedizione" },
      { status: 500 },
    )
  }
}
