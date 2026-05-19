const axios = require("axios");
const amqp = require("amqplib");
const fs = require("fs");

// Prometheus URL
const PROMETHEUS_URL = "http://localhost:9090/api/v1/query";

// Queries
const ORDER_QUERY =
  'increase(order_service_orders_total{method="POST",status="200"}[1m])';
const USER_QUERY =
  'rate(user_service_requests_total{method="POST",status="200"}[1m])';
const CPU_QUERY =
  '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[30s])) * 100)';

// Sliding window
const WINDOW_SIZE = 10;
const Z_THRESHOLD = 2;

// History arrays
let orderHistory = [];
let userHistory = [];
let cpuHistory = [];

// RabbitMQ
let channel;

// -----------------------------
// Connect RabbitMQ
// -----------------------------
async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect("amqp://localhost");
    channel = await connection.createChannel();
    await channel.assertQueue("anomaly_queue");
    console.log("Connected to RabbitMQ");
  } catch (err) {
    console.log("RabbitMQ Error, retrying...");
    setTimeout(connectRabbitMQ, 5000);
  }
}

// -----------------------------
// Fetch metric from Prometheus
// -----------------------------
async function fetchMetric(query) {
  try {
    const res = await axios.get(PROMETHEUS_URL, {
      params: { query },
    });

    const result = res.data?.data?.result;

    if (result && result.length > 0) {
      return parseFloat(result[0].value[1]);
    }

    return 0;
  } catch (err) {
    console.log("Prometheus Error:", err.message);
    return 0;
  }
}

// -----------------------------
// Maintain sliding window
// -----------------------------
function updateHistory(history, value) {
  history.push(value);
  if (history.length > WINDOW_SIZE) {
    history.shift();
  }
}

// -----------------------------
// Z-score anomaly detection
// -----------------------------
function isAnomaly(history, value, name) {
  if (history.length < 5) return false;

  //The system calculates the average historical behaviour.
  const mean = history.reduce((a, b) => a + b, 0) / history.length;

  //Variance measures how much the data deviates from the average
  const variance =
    history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    history.length;

  //The standard deviation is the square root of the variance, providing a measure of how spread out the data is around the mean.
  const std = Math.sqrt(variance);

  if (std === 0) return false;

  //Z-score measures how far the current metric deviates from historical behaviour.
  const zScore = (value - mean) / std;

  console.log(`${name} Z-score: ${zScore.toFixed(2)}`);

  //If the deviation exceeds the configured threshold, the system classifies it as an anomaly.
  return Math.abs(zScore) > Z_THRESHOLD;
}

// -----------------------------
// Send to RabbitMQ
// -----------------------------
async function sendToRabbitMQ(message) {
  try {
    if (!channel) {
      console.log("RabbitMQ channel not ready");
      return;
    }

    await channel.assertQueue("anomaly_queue");

    channel.sendToQueue("anomaly_queue", Buffer.from(message));

    console.log("Sent:", message);
  } catch (err) {
    console.log("RabbitMQ Send Error:", err.message);

    // reconnect
    await connectRabbitMQ();
  }
}

function logAnomaly(message) {
  const logMessage = `${new Date().toISOString()} - ${message}\n`;

  fs.appendFileSync("../anomaly.log", logMessage);

  console.log("Logged:", message);
}

// -----------------------------
// Main Loop
// -----------------------------
async function monitor() {
  console.log("AI Anomaly Detection Started...\n");

  while (true) {
    try {
      const orderVal = await fetchMetric(ORDER_QUERY);
      const userVal = await fetchMetric(USER_QUERY);
      const cpuVal = await fetchMetric(CPU_QUERY);

      console.log("\n==============================");
      console.log(`Order Traffic: ${orderVal}`);
      console.log(`User Traffic: ${userVal}`);
      console.log(`CPU Usage: ${cpuVal.toFixed(2)}%`);

      // Update history
      updateHistory(orderHistory, orderVal);
      updateHistory(userHistory, userVal);
      updateHistory(cpuHistory, cpuVal);

      console.log("\n--- AI Anomaly Detection ---");

      const orderAnomaly = isAnomaly(orderHistory, orderVal, "Order");
      const userAnomaly = isAnomaly(userHistory, userVal, "User");
      const cpuAnomaly = isAnomaly(cpuHistory, cpuVal, "CPU");

      // Actions
      if (orderAnomaly) {
        const msg = "AI Detected Anomaly in Order Service Traffic";
        console.log(msg);
        sendToRabbitMQ(msg);
        logAnomaly(msg);
      }

      if (userAnomaly) {
        const msg = "AI Detected Anomaly in User Service Traffic";
        console.log(msg);
        sendToRabbitMQ(msg);
        logAnomaly(msg);
      }

      if (cpuAnomaly) {
        const msg = "AI Detected Anomaly in CPU Usage";
        console.log(msg);
        sendToRabbitMQ(msg);
        logAnomaly(msg);
      }

      if (orderAnomaly && userAnomaly) {
        const msg = "CRITICAL: Multi-service anomaly detected";
        console.log(msg);
        sendToRabbitMQ(msg);
        logAnomaly(msg);
      }

      // Wait 10 sec
      await new Promise((res) => setTimeout(res, 10000));
    } catch (err) {
      console.log("Error:", err.message);
    }
  }
}

// -----------------------------
// Start
// -----------------------------
connectRabbitMQ();
monitor();
