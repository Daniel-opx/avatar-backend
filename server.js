require("dotenv").config();

const express = require("express");
const jobsRouter = require("./routes/jobs");

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === "production" && !process.env.API_KEY) {
  console.error("API_KEY must be configured in production.");
  process.exit(1);
}

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Avatar backend is running" });
});

// Jobs endpoints: POST /jobs and GET /jobs
app.use("/jobs", (req, res, next) => {
  // Local development can be used without a key; production requires one.
  const expected = process.env.API_KEY;
  if (!expected && process.env.NODE_ENV !== "production") return next();
  if (req.get("x-api-key") !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}, jobsRouter);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Avatar backend listening on port ${PORT}`);
});
