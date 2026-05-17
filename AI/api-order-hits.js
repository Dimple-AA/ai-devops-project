const axios = require("axios");

const URL = "http://localhost:3001/orders";

async function run() {
  for (let i = 0; i < 500; i++) {
    try {
      const res = await axios.post(URL, {
        user_id: i,
        item: "test",
        amount: 500,
      });

      console.log(`${i + 1}: Status ${res.status}`);
    } catch (err) {
      console.log(`${i + 1}: Error ${err.message}`);
    }
  }
}

run();
