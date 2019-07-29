const express = require("express");
const app = express();
const { resolve } = require("path");
const envPath = resolve("../../.env");
const env = require("dotenv").config({ path: envPath });
const stripe = require("stripe")(env.parsed.STRIPE_SECRET_KEY);

app.use(express.static("../../client"));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.get("/", (req, res) => {
  // Display checkout page
  const path = resolve("../../client/index.html");
  res.sendFile(path);
});

const calculateOrderAmount = items => {
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

const calculateTax = (postalCode, amount) => {
  // Use the postal code and order information
  // to calculate the right amount of tax for the purchase
  return Math.floor(Math.random() * 500);
};

app.post("/create-payment-intent", async (req, res) => {
  const { items, currency } = req.body;
  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await stripe.paymentIntents.create({
    amount: calculateOrderAmount(items),
    currency: currency
  });

  // Send public key and PaymentIntent details to client
  res.send({
    publicKey: env.parsed.STRIPE_PUBLIC_KEY,
    clientSecret: paymentIntent.client_secret,
    id: paymentIntent.id
  });
});

app.post("/calculate-tax", async (req, res) => {
  const { items, postalCode, paymentIntentId } = req.body;
  // Calculate order amount from items
  const orderAmount = calculateOrderAmount(items);
  // Calculate tax from order total and postal code
  const tax = postalCode ? calculateTax(postalCode, orderAmount) : 0;
  const total = orderAmount + tax;

  // Update the total on the PaymentIntent so the right amount
  // is captured upon confirmation
  stripe.paymentIntents.update(paymentIntentId, { amount: total });

  // Return new tax and total amounts to display on the client
  res.send({
    tax: (tax / 100).toFixed(2),
    total: (total / 100).toFixed(2)
  });
});

// Webhook handler for asynchronous events.
app.post("/webhook", async (req, res) => {
  // Check if webhook signing is configured.
  if (env.parsed.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        env.parsed.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }

  if (eventType === "payment_intent.succeeded") {
    // Fulfill any orders, e-mail receipts, etc
    console.log("💰Payment received!");
  }

  if (eventType === "payment_intent.payment_failed") {
    // Notify the customer that their order was not fulfilled
    console.log("❌  Payment failed.");
  }

  res.sendStatus(200);
});

app.listen(4242, () => console.log(`Node server listening on port ${4242}!`));
