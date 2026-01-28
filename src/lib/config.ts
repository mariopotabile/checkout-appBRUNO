// src/lib/config.ts
import { db } from "./firebaseAdmin"

export interface ShopifyConfig {
  shopDomain: string
  clientId: string        // ✅ NUOVO: sostituisce adminToken
  clientSecret: string    // ✅ NUOVO
  apiVersion: string
  storefrontToken?: string
}

export interface StripeAccount {
  label: string
  secretKey: string
  publishableKey: string
  webhookSecret: string
  active?: boolean
  order?: number
  merchantSite?: string
  lastUsedAt?: number
  productTitle1?: string
  productTitle2?: string
  productTitle3?: string
  productTitle4?: string
  productTitle5?: string
  productTitle6?: string
  productTitle7?: string
  productTitle8?: string
  productTitle9?: string
  productTitle10?: string
}

export interface AppConfig {
  checkoutDomain: string
  shopify: ShopifyConfig
  stripeAccounts: StripeAccount[]
  defaultCurrency?: string
}

const CONFIG_COLLECTION = "config"
const CONFIG_DOC_ID = "global"

const defaultConfig: AppConfig = {
  checkoutDomain: process.env.NEXT_PUBLIC_CHECKOUT_DOMAIN || "",
  defaultCurrency: "eur",

  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || "",
    clientId: process.env.SHOPIFY_CLIENT_ID || "",           // ✅ NUOVO
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || "",   // ✅ NUOVO
    apiVersion: process.env.SHOPIFY_API_VERSION || "2024-10",
    storefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || "",
  },

  stripeAccounts: [
    { 
      label: "Account 1", 
      secretKey: "", 
      publishableKey: "",
      webhookSecret: "", 
      active: true, 
      order: 0,
      merchantSite: "",
      lastUsedAt: 0,
      productTitle1: "",
      productTitle2: "",
      productTitle3: "",
      productTitle4: "",
      productTitle5: "",
      productTitle6: "",
      productTitle7: "",
      productTitle8: "",
      productTitle9: "",
      productTitle10: "",
    },
    { 
      label: "Account 2", 
      secretKey: "", 
      publishableKey: "",
      webhookSecret: "", 
      active: false, 
      order: 1,
      merchantSite: "",
      lastUsedAt: 0,
      productTitle1: "",
      productTitle2: "",
      productTitle3: "",
      productTitle4: "",
      productTitle5: "",
      productTitle6: "",
      productTitle7: "",
      productTitle8: "",
      productTitle9: "",
      productTitle10: "",
    },
    { 
      label: "Account 3", 
      secretKey: "", 
      publishableKey: "",
      webhookSecret: "", 
      active: false, 
      order: 2,
      merchantSite: "",
      lastUsedAt: 0,
      productTitle1: "",
      productTitle2: "",
      productTitle3: "",
      productTitle4: "",
      productTitle5: "",
      productTitle6: "",
      productTitle7: "",
      productTitle8: "",
      productTitle9: "",
      productTitle10: "",
    },
    { 
      label: "Account 4", 
      secretKey: "", 
      publishableKey: "",
      webhookSecret: "", 
      active: false, 
      order: 3,
      merchantSite: "",
      lastUsedAt: 0,
      productTitle1: "",
      productTitle2: "",
      productTitle3: "",
      productTitle4: "",
      productTitle5: "",
      productTitle6: "",
      productTitle7: "",
      productTitle8: "",
      productTitle9: "",
      productTitle10: "",
    },
  ],
}

export async function getConfig(): Promise<AppConfig> {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID)
  const snap = await ref.get()

  if (!snap.exists) {
    return defaultConfig
  }

  const data = snap.data() || {}

  const shopify: ShopifyConfig = {
    shopDomain: data.shopify?.shopDomain || defaultConfig.shopify.shopDomain,
    clientId: data.shopify?.clientId || defaultConfig.shopify.clientId,             // ✅ NUOVO
    clientSecret: data.shopify?.clientSecret || defaultConfig.shopify.clientSecret, // ✅ NUOVO
    apiVersion: data.shopify?.apiVersion || defaultConfig.shopify.apiVersion,
    storefrontToken: data.shopify?.storefrontToken || defaultConfig.shopify.storefrontToken,
  }

  const stripeAccounts: StripeAccount[] = (data.stripeAccounts ||
    defaultConfig.stripeAccounts
  ).map((acc: any, idx: number) => ({
    label: acc?.label || `Account ${idx + 1}`,
    secretKey: acc?.secretKey || "",
    publishableKey: acc?.publishableKey || "",
    webhookSecret: acc?.webhookSecret || "",
    active: acc?.active ?? (idx === 0),
    order: typeof acc?.order === "number" ? acc.order : idx,
    merchantSite: acc?.merchantSite || "",
    lastUsedAt: acc?.lastUsedAt || 0,
    productTitle1: acc?.productTitle1 || "",
    productTitle2: acc?.productTitle2 || "",
    productTitle3: acc?.productTitle3 || "",
    productTitle4: acc?.productTitle4 || "",
    productTitle5: acc?.productTitle5 || "",
    productTitle6: acc?.productTitle6 || "",
    productTitle7: acc?.productTitle7 || "",
    productTitle8: acc?.productTitle8 || "",
    productTitle9: acc?.productTitle9 || "",
    productTitle10: acc?.productTitle10 || "",
  }))

  return {
    checkoutDomain: data.checkoutDomain || defaultConfig.checkoutDomain,
    defaultCurrency: data.defaultCurrency || defaultConfig.defaultCurrency,
    shopify,
    stripeAccounts,
  }
}

export async function setConfig(newConfig: Partial<AppConfig>): Promise<void> {
  const ref = db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC_ID)

  if (newConfig.stripeAccounts) {
    newConfig.stripeAccounts = newConfig.stripeAccounts.map((acc: any, idx: number) => ({
      label: acc?.label || `Account ${idx + 1}`,
      secretKey: acc?.secretKey || "",
      publishableKey: acc?.publishableKey || "",
      webhookSecret: acc?.webhookSecret || "",
      active: acc?.active ?? false,
      order: typeof acc?.order === "number" ? acc.order : idx,
      merchantSite: acc?.merchantSite || "",
      lastUsedAt: acc?.lastUsedAt ?? 0,
      productTitle1: acc?.productTitle1 || "",
      productTitle2: acc?.productTitle2 || "",
      productTitle3: acc?.productTitle3 || "",
      productTitle4: acc?.productTitle4 || "",
      productTitle5: acc?.productTitle5 || "",
      productTitle6: acc?.productTitle6 || "",
      productTitle7: acc?.productTitle7 || "",
      productTitle8: acc?.productTitle8 || "",
      productTitle9: acc?.productTitle9 || "",
      productTitle10: acc?.productTitle10 || "",
    }))
  }

  await ref.set(newConfig, { merge: true })

  console.log("[setConfig] ✓ Config salvata su Firebase")
}

export async function getActiveStripeAccount(): Promise<StripeAccount | null> {
  const cfg = await getConfig()
  if (!cfg.stripeAccounts?.length) return null

  const active = cfg.stripeAccounts.find(
    a => a.active && a.secretKey && a.publishableKey
  )
  if (active) {
    console.log(`[getActiveStripeAccount] ✓ Account attivo: ${active.label}`)
    return active
  }

  const withKey = cfg.stripeAccounts.find(
    a => a.secretKey && a.publishableKey
  )
  if (withKey) {
    console.log(`[getActiveStripeAccount] ⚠ Fallback a primo account con keys: ${withKey.label}`)
    return withKey
  }

  console.log(`[getActiveStripeAccount] ⚠ Nessun account valido, ritorno primo`)
  return cfg.stripeAccounts[0]
}