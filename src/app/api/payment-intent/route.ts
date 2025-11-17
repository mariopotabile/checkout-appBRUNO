import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getConfig } from "@/lib/config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amount, sessionId, customer } = body;

    if (!amount || !sessionId) {
      return NextResponse.json(
        { error: "Missing amount or sessionId" },
        { status: 400 }
      );
    }

    const cfg = await getConfig();
    const activeAccount = cfg.stripeAccounts.find(a => a.secretKey);
    if (!activeAccount) {
      return NextResponse.json(
        { error: "No active Stripe account" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(activeAccount.secretKey, {
      apiVersion: "2025-10-29.clover",
    });

    // Sanitize shipping
    const shippingInfo =
      customer?.fullName && customer?.address1
        ? {
            name: customer.fullName,
            phone: customer.phone || "",
            address: {
              line1: customer.address1,
              line2: customer.address2 || "",
              city: customer.city,
              postal_code: customer.zip,
              state: customer.province,
              country: customer.country || "IT",
            },
          }
        : undefined;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: cfg.defaultCurrency || "eur",
      metadata: {
        sessionId: sessionId,
        ...(customer?.email ? { customer_email: customer.email } : {}),
        ...(customer?.fullName ? { customer_name: customer.fullName } : {}),
        merchant_site: cfg.checkoutDomain || "checkout-app",
      },
      payment_method_types: ["card"],
      capture_method: "automatic_async",
      ...(shippingInfo ? { shipping: shippingInfo } : {}),
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      sessionId,
    });
  } catch (err: any) {
    console.error("PAYMENT INTENT ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Payment Intent error" },
      { status: 500 }
    );
  }
}