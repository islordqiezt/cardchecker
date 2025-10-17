export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lista = searchParams.get("lista")
  const skc = searchParams.get("skc")
  const tg = searchParams.get("tg")
  const amo = searchParams.get("amo") || "0.5"

  if (!lista || !skc) {
    return new Response("Missing required parameters", { status: 400 })
  }

  // Parse card details
  const cardParts = lista.split(/[:|]/)
  if (cardParts.length < 4) {
    return new Response("Invalid card format", { status: 400 })
  }

  let [cc, mes, ano, cvv] = cardParts

  // Format month and year
  if (mes.length === 1) mes = `0${mes}`
  if (ano.length === 2) ano = `20${ano}`

  const amount = Math.round(Number.parseFloat(amo) * 100) // Convert to cents

  try {
    // Step 1: Create payment method
    const paymentMethodResponse = await fetch("https://api.stripe.com/v1/payment_methods", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${skc}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        type: "card",
        "card[number]": cc,
        "card[exp_month]": mes,
        "card[exp_year]": ano,
        "card[cvc]": cvv,
      }),
    })

    const paymentMethodData = await paymentMethodResponse.text()

    // Check for immediate errors
    if (paymentMethodData.includes("testmode_charges_only")) {
      return new Response("SK_DIE")
    }
    if (paymentMethodData.includes("api_key_expired")) {
      return new Response("SK_INVALID")
    }
    if (paymentMethodData.includes("parameter_invalid_empty")) {
      return new Response("#DIE CC: " + lista + " <br>Result: ENTER CC TO CHECK<br>")
    }
    if (paymentMethodData.includes("incorrect_number")) {
      return new Response("#DIE CC: " + lista + " <br>Result: INCORRECT CARD NUMBER<br>")
    }
    if (paymentMethodData.includes("invalid_expiry_month")) {
      return new Response("#DIE CC: " + lista + " <br>Result: INVALID EXPIRY MONTH<br>")
    }
    if (paymentMethodData.includes("card_not_supported")) {
      return new Response("#DIE CC: " + lista + " <br>Result: CARD NOT SUPPORTED<br>")
    }
    if (paymentMethodData.includes("generic_decline")) {
      return new Response("#DIE CC: " + lista + " <br>Result: GENERIC DECLINED<br>")
    }

    const paymentMethodId = extractValue(paymentMethodData, '"id": "', '"')

    if (!paymentMethodId) {
      return new Response("#DIE CC: " + lista + " <br>Result: FAILED TO CREATE PAYMENT METHOD<br>")
    }

    // Step 2: Create payment intent
    const paymentIntentResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${skc}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: amount.toString(),
        currency: "usd",
        "payment_method_types[]": "card",
      }),
    })

    const paymentIntentData = await paymentIntentResponse.text()
    const paymentIntentId = extractValue(paymentIntentData, '"id": "', '"')

    if (!paymentIntentId) {
      return new Response("#DIE CC: " + lista + " <br>Result: FAILED TO CREATE PAYMENT INTENT<br>")
    }

    // Step 3: Confirm payment intent
    const confirmResponse = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${skc}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        payment_method: paymentMethodId,
      }),
    })

    const confirmData = await confirmResponse.text()

    // Extract response details
    const declineCode = extractValue(confirmData, '"decline_code": "', '"')
    const reason = extractValue(confirmData, '"reason": "', '"')
    const riskLevel = extractValue(confirmData, '"risk_level": "', '"')
    const sellerMessage = extractValue(confirmData, '"seller_message": "', '"')
    const cvcCheck = extractValue(confirmData, '"cvc_check": "', '"')
    const receiptUrl = extractValue(confirmData, '"receipt_url": "', '"')

    // Analyze responses and return appropriate result
    if (confirmData.includes('"seller_message": "Payment complete."')) {
      return new Response(
        `#CHARGED CC: ${lista} <br>➤ Response: $${amo} Charged ✅<br>➤ Receipt: <a href="${receiptUrl}">Here</a><br>`,
      )
    }

    if (
      confirmData.includes('"cvc_check": "pass"') ||
      paymentIntentData.includes('"cvc_check": "pass"') ||
      paymentMethodData.includes('"cvc_check": "pass"')
    ) {
      return new Response(`#CVV CC: ${lista} <br>Result: CVV LIVE<br>`)
    }

    if (confirmData.includes("insufficient_funds")) {
      return new Response(`#CCN CC: ${lista} <br>Result: INSUFFICIENT FUNDS<br>`)
    }

    if (confirmData.includes("authentication_required") || confirmData.includes("card_error_authentication_required")) {
      return new Response(`#CCN CC: ${lista} <br>Result: 3DS REQUIRED<br>`)
    }

    if (
      confirmData.includes("incorrect_cvc") ||
      paymentIntentData.includes("incorrect_cvc") ||
      paymentMethodData.includes("incorrect_cvc")
    ) {
      return new Response(`#CVV CC: ${lista} <br>Result: Security code is incorrect<br>`)
    }

    if (
      confirmData.includes("invalid_cvc") ||
      paymentIntentData.includes("invalid_cvc") ||
      paymentMethodData.includes("invalid_cvc")
    ) {
      return new Response(`#CVV CC: ${lista} <br>Result: Security code is incorrect<br>`)
    }

    if (confirmData.includes("transaction_not_allowed")) {
      return new Response(`#CCN CC: ${lista} <br>Result: TRANSACTION NOT ALLOWED<br>`)
    }

    // Dead card responses
    if (
      confirmData.includes("fraudulent") ||
      paymentIntentData.includes("fraudulent") ||
      paymentMethodData.includes("fraudulent")
    ) {
      return new Response(`#DIE CC: ${lista} <br>Result: FRAUDULENT<br>`)
    }

    if (confirmData.includes("generic_decline") || paymentIntentData.includes("generic_decline")) {
      return new Response(`#DIE CC: ${lista} <br>Result: GENERIC DECLINED<br>`)
    }

    if (
      confirmData.includes("do_not_honor") ||
      paymentIntentData.includes("do_not_honor") ||
      paymentMethodData.includes("do_not_honor")
    ) {
      return new Response(`#DIE CC: ${lista} <br>Result: DO NOT HONOR<br>`)
    }

    if (confirmData.includes("lost_card") || paymentIntentData.includes("lost_card")) {
      return new Response(`#DIE CC: ${lista} <br>Result: LOST CARD<br>`)
    }

    if (confirmData.includes("stolen_card") || paymentIntentData.includes("stolen_card")) {
      return new Response(`#DIE CC: ${lista} <br>Result: STOLEN CARD<br>`)
    }

    if (confirmData.includes("pickup_card") || paymentIntentData.includes("pickup_card")) {
      return new Response(`#DIE CC: ${lista} <br>Result: PICKUP CARD<br>`)
    }

    if (confirmData.includes("Your card has expired") || paymentIntentData.includes("Your card has expired")) {
      return new Response(`#DIE CC: ${lista} <br>Result: EXPIRED CARD<br>`)
    }

    if (confirmData.includes("card_decline_rate_limit_exceeded")) {
      return new Response(`#DIE CC: ${lista} <br>Result: SK IS AT RATE LIMIT<br>`)
    }

    if (confirmData.includes("processing_error") || paymentIntentData.includes("processing_error")) {
      return new Response(`#DIE CC: ${lista} <br>Result: PROCESSING ERROR<br>`)
    }

    if (
      confirmData.includes("Your card number is incorrect") ||
      paymentIntentData.includes("Your card number is incorrect")
    ) {
      return new Response(`#DIE CC: ${lista} <br>Result: YOUR CARD NUMBER IS INCORRECT<br>`)
    }

    if (confirmData.includes("service_not_allowed")) {
      return new Response(`#DIE CC: ${lista} <br>Result: SERVICE NOT ALLOWED<br>`)
    }

    if (
      confirmData.includes("Your card was declined") ||
      paymentIntentData.includes("Your card was declined") ||
      paymentMethodData.includes("Your card was declined")
    ) {
      return new Response(`#DIE CC: ${lista} <br>Result: CARD DECLINED<br>`)
    }

    if (confirmData.includes("currency_not_supported")) {
      return new Response(`#DIE CC: ${lista} <br>Result: CURRENCY NOT SUPPORTED<br>`)
    }

    if (confirmData.includes("Your card does not support this type of purchase")) {
      return new Response(`#DIE CC: ${lista} <br>Result: CARD NOT SUPPORT THIS TYPE OF PURCHASE<br>`)
    }

    // Default response
    return new Response(`#DIE CC: ${lista} <br>Result: INCREASE AMOUNT OR TRY ANOTHER CARD<br>`)
  } catch (error) {
    console.error("Error processing card:", error)
    return new Response(`#DIE CC: ${lista} <br>Result: API ERROR<br>`)
  }
}

function extractValue(text: string, start: string, end: string): string {
  const startIndex = text.indexOf(start)
  if (startIndex === -1) return ""

  const valueStart = startIndex + start.length
  const endIndex = text.indexOf(end, valueStart)
  if (endIndex === -1) return ""

  return text.substring(valueStart, endIndex).trim()
}
