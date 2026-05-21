// Step 1: Install express
// Run in terminal: npm install express

// Step 2: Create index.js with the following code

const express = require("express");
const app = express();
const PORT = 3000;

// Basic GET endpoint
app.get("/", (req, res) => {
  res.send("Hello, this is a simple Node.js API response!");
});

// Another endpoint with JSON response
app.get("/api/data", (req, res) => {
  res.json({
    message: "Here is some sample data",
    status: "success",
    items: ["Node.js", "Express", "API"]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
