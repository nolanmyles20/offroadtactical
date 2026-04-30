const allowedOrigins = [
  "https://offroadtactical.com",
  "https://www.offroadtactical.com"
];

const PRODUCT_URLS = [
  "https://www.offroadtactical.com/assets/products.json",
  "https://www.offroadtactical.com/assets/products_humvee.json",
  "https://www.offroadtactical.com/assets/products_jeep.json",
  "https://www.offroadtactical.com/assets/products_apparel.json",
  "https://www.offroadtactical.com/assets/products_edc.json",
  "https://www.offroadtactical.com/assets/products_targets.json",
  "https://www.offroadtactical.com/assets/products_ar-15.json"
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

async function loadProducts() {
  const all = [];

  for (const url of PRODUCT_URLS) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed loading ${url}`);
    const data = await res.json();
    if (Array.isArray(data)) all.push(...data);
  }

  return all;
}

function getPrice(product, item) {
  let price = Math.round(Number(product.basePrice || product.price || 0) * 100);

  // handle variants
  if (product.variant_price_cents && item.options) {
    const key = Object.values(item.options).join(" / ");
    if (product.variant_price_cents[key]) {
      price = product.variant_price_cents[key];
    }
  }

  if (price <= 0) {
    throw new Error(`Invalid price for ${product.title || product.id}`);
  }

  return price;
}

function getShipping(subtotal) {
  if (subtotal >= 7500) return 0;
  return 895;
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
    const body = JSON.parse(event.body || "{}");
    const lines = Array.isArray(body.lines) ? body.lines : [];

    if (!lines.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Cart is empty" })
      };
    }

    const products = await loadProducts();

    let subtotal = 0;

    const line_items = lines.map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product) throw new Error(`Invalid product: ${item.id}`);

      const qty = Math.max(1, parseInt(item.qty || 1, 10));
      const price = getPrice(product, item);

      subtotal += price * qty;

      return {
        name: String(product.title || product.name || product.id).slice(0, 120),
        quantity: qty.toString(),
        base_price_money: {
          amount: price,
          currency: "USD"
        }
      };
    });

    const shipping = getShipping(subtotal);

    line_items.push({
      name: shipping > 0 ? "Shipping" : "Free Shipping Applied",
      quantity: "1",
      base_price_money: {
        amount: shipping,
        currency: "USD"
      }
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
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: "Square checkout failed", square: data })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: data.payment_link.url })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
