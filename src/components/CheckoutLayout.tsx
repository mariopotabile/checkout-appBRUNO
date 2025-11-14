"use client"

import React from "react"

interface CheckoutLayoutProps {
  children: React.ReactNode
}

export default function CheckoutLayout({ children }: CheckoutLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header tipo Shopify minimal */}
      <header className="border-b bg-white">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-black"></div>
            <span className="font-semibold text-lg tracking-tight">
              Checkout
            </span>
          </div>
          <div className="text-xs text-gray-500">
            Pagamento sicuro
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4">
        {children}
      </main>

      <footer className="border-t mt-10 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 text-xs text-gray-500 flex justify-between">
          <span>© {new Date().getFullYear()} Checkout App</span>
          <span>Powered by Stripe · Shopify compatible</span>
        </div>
      </footer>
    </div>
  )
}