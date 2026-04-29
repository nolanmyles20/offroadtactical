const allowedOrigins = [
  "https://offroadtactical.com",
  "https://www.offroadtactical.com"
];

function getHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://offroadtactical.com",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
}

exports.handler = async (event) => {
  const headers = getHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const cart = JSON.parse(event.body || "{}");
    const lines = Array.isArray(cart.lines) ? cart.lines : [];

    if (!lines.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Cart is empty" })
      };
    }

    const line_items = lines.map((item) => {
      const name = String(item.title || "OFFROAD TACTICAL Item").slice(0, 120);
      const quantity = Math.max(1, Number(item.qty) || 1).toString();
      const amount = Math.round(Number(item.price_cents) || 0);

      if (amount <= 0) {
        throw new Error(`Missing price for ${name}`);
      }

      return {
        name,
        quantity,
        note: item.variantId ? `Variant ID: ${item.variantId}` : undefined,
        base_price_money: {
          amount,
          currency: "USD"
        }
      };
    });

    const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-12-18"
      },
      body: JSON.stringify({
        idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        order: {
          location_id: process.env.SQUARE_LOCATION_ID,
          line_items
        },
        checkout_options: {
          redirect_url: "https://www.offroadtactical.com/ordercomplete.html"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Square API error:", data);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error:
            data?.errors?.[0]?.detail ||
            data?.errors?.[0]?.code ||
            "Square checkout failed",
          square: data
        })
      };
    }

    const url = data?.payment_link?.url;

    if (!url) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Square did not return a checkout URL",
          square: data
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url })
    };

  } catch (err) {
    console.error("Checkout function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message || "Checkout failed"
      })
    };
  }
};
