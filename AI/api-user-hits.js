const axios = require("axios");

const URL = "http://localhost:3000/users";

async function hitUsersAPI() {
  for (let i = 0; i < 500; i++) {
    try {
      const response = await axios.post(URL, {
        name: `user${i}`,
        email: `user${i}@test.com`,
      });

      console.log(`${i + 1}: ${response.status}`);
    } catch (error) {
      if (error.response) {
        console.log(`${i + 1}: Error ${error.response.status}`);
      } else {
        console.log(`${i + 1}: Error ${error.message}`);
      }
    }
  }
}

hitUsersAPI();
