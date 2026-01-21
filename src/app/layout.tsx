// src/app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import FacebookPixel from "@/components/FacebookPixel"

export const metadata: Metadata = {
  title: "Checkout Sicuro | Pagamento Protetto",
  description: "Checkout sicuro con pagamenti protetti SSL e crittografia avanzata",
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <FacebookPixel />
        {children}
      </body>
    </html>
  )
}
