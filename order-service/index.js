const express = require("express");
const amqp = require("amqplib");
const client = require("prom-client");
const winston = require("winston");

const app = express();
app.use(express.json());

const PORT = 3001;
const RABBITMQ_URL = "amqp://rabbitmq";

// Logger
const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

// Metrics
client.collectDefaultMetrics();

const orderCounter = new client.Counter({
  name: "order_service_orders_total",
  help: "Total number of orders created",
  labelNames: ["method", "status"],
});

const orderErrorCounter = new client.Counter({
  name: "order_service_errors_total",
  help: "Total number of errors in order service",
});

let channel = null;

async function connectRabbitMQ() {
  while (!channel) {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertQueue("devops_events");
      console.log("Connected to RabbitMQ");
    } catch (err) {
      console.log("RabbitMQ not ready, retrying in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
// Start connection in background
connectRabbitMQ().catch(console.error);

app.post("/orders", async (req, res) => {
  try {
    const order = req.body;

    logger.info("Order created", order);

    const event = {
      type: "ORDER_CREATED",
      data: order,
      timestamp: new Date(),
    };

    if (channel) {
      channel.sendToQueue("devops_events", Buffer.from(JSON.stringify(event)));
    }

    orderCounter.inc({
      method: "POST",
      status: 200,
    });

    res.json({ message: "Order created", order });
  } catch (err) {
    logger.error("Error creating order", err);

    orderErrorCounter.inc();

    orderCounter.inc({
      method: "POST",
      status: 500,
    });

    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
