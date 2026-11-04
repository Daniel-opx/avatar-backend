require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "avatar-backend"
    });
});

// HeyGen webhook (placeholder)
app.post("/webhooks/heygen", (req, res) => {
    console.log("Received HeyGen webhook");
    res.sendStatus(200);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});