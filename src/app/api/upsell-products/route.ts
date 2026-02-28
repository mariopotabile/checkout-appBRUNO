// src/app/api/upsell-products/route.ts
import { NextResponse } from "next/server"
import { getConfig } from "@/lib/config"

const UPSELL_HANDLES = [
  "bundle-90-giorni-nimea™",
  "nimea™-silhouette-cintura-modellante",
]

export async function GET() {
  try {
    const config = await getConfig()
    const shopDomain = config.shopify?.shopDomain
    const storefrontToken = config.shopify?.storefrontToken

    if (!shopDomain || !storefrontToken) {
      return NextResponse.json({ error: "Config Shopify mancante" }, { status: 500 })
    }

    const results = await Promise.all(
      UPSELL_HANDLES.map(async (handle) => {
        const q = `
          query getProduct($handle: String!) {
            product(handle: $handle) {
              id
              title
              handle
              featuredImage { url }
              options { name values }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    availableForSale
                    price { amount currencyCode }
                    selectedOptions { name value }
                    image { url }
                  }
                }
              }
            }
          }
        `
        const res = await fetch(`https://${shopDomain}/api/2024-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": storefrontToken,
          },
          body: JSON.stringify({ query: q, variables: { handle } }),
        })
        const data = await res.json()
        const product = data?.data?.product
        if (!product) return null

        const variants = product.variants.edges.map(({ node }: any) => {
          const numericId = node.id.split("/").pop()
          return {
            id: numericId,
            gid: node.id,
            title: node.title,
            availableForSale: node.availableForSale,
            priceCents: Math.round(parseFloat(node.price.amount) * 100),
            selectedOptions: node.selectedOptions,
            image: node.image?.url || null,
          }
        })

        return {
          handle: product.handle,
          title: product.title,
          image: product.featuredImage?.url || null,
          options: product.options,
          variants,
        }
      })
    )

    return NextResponse.json({ products: results.filter(Boolean) })
  } catch (err: any) {
    console.error("[upsell-products] Errore:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
