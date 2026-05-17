const amqp = require("amqplib");

async function startConsumer() {
  try {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();

    const queue = "anomaly_queue";

    await channel.assertQueue(queue);

    console.log("🚀 Automation Consumer Started...");
    console.log("👂 Waiting for anomaly events...\n");

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        const message = msg.content.toString();

        console.log("📩 Received Event:", message);

        // -----------------------------
        // Simulated DevOps Automation
        // -----------------------------

        if (message.includes("Order")) {
          console.log("⚙️ Triggering DevOps Action...");
          console.log("🔄 Restarting Order Service...");
        }

        if (message.includes("User")) {
          console.log("⚙️ Triggering DevOps Action...");
          console.log("📢 Sending Alert to Admin...");
        }

        if (message.includes("CPU")) {
          console.log("⚙️ Triggering DevOps Action...");
          console.log("📈 Scaling Infrastructure...");
        }

        console.log("----------------------------------\n");

        channel.ack(msg);
      }
    });
  } catch (err) {
    console.log("❌ Consumer Error:", err.message);
  }
}

startConsumer();
