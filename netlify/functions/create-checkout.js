exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const items = body.items || [];

    if (!items.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Cart is empty" }),
      };
    }

    // 🔒 HARD-CODED PRODUCT MAP (SECURE)
    const PRODUCT_MAP = {
      "strike-grip-sack": { name: "Strike Grip Sack", price: 2000 },
      "lucky-grip-sack": { name: "Lucky Grip Sack", price: 2000 },
      "bowling-shammy": { name: "Bowling Shammy", price: 2000 }
    };

    const line_items = items.map(item => {
      const product = PRODUCT_MAP[item.id];
      if (!product) throw new Error("Invalid product");

      return {
        name: product.name,
        quantity: item.qty.toString(),
        base_price_money: {
          amount: product.price,
          currency: "USD"
        }
      };
    });

    const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idempotency_key: Date.now().toString(),
        order: {
          location_id: process.env.SQUARE_LOCATION_ID,
          line_items
        }
      })
    });

    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        checkoutUrl: data.payment_link.url
      })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Checkout failed" })
    };
  }
};
