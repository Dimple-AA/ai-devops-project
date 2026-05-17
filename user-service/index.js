const express = require("express");
const amqp = require("amqplib");
const client = require("prom-client");
const winston = require("winston");

const app = express();
app.use(express.json());

const PORT = 3000;
const RABBITMQ_URL = "amqp://rabbitmq";

// Logger setup
const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

// Prometheus metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "user_service_requests_total",
  help: "Total number of requests to user service",
  labelNames: ["method", "status"],
});

const errorCounter = new client.Counter({
  name: "user_service_errors_total",
  help: "Total number of errors in user service",
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
// API
app.post("/users", async (req, res) => {
  try {
    const user = req.body;

    logger.info("User created", user);

    const event = {
      type: "USER_CREATED",
      data: user,
      timestamp: new Date(),
    };

    if (channel) {
      channel.sendToQueue("devops_events", Buffer.from(JSON.stringify(event)));
    }

    httpRequestCounter.inc({
      method: "POST",
      status: 200,
    });

    res.json({ message: "User created", user });
  } catch (err) {
    logger.error("Error creating user", err);

    errorCounter.inc();

    httpRequestCounter.inc({
      method: "POST",
      status: 500,
    });

    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
