const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");

// Load .env file from backend root directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { registerRoutes } = require("./routes");
const { errorHandler, notFoundHandler } = require("./utils/errorHandlers");
const { connectToDatabase } = require("./db/db");

const app = express();

app.use(cors());

// Body parser middleware - handle both JSON and text/plain
app.use(express.json({ type: ['application/json', 'text/plain'] }));
app.use(express.text({ type: 'text/plain' }));

// Custom middleware to parse text/plain as JSON if needed
app.use((req, res, next) => {
  if (req.get('Content-Type') === 'text/plain' && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch (e) {
      // If parsing fails, continue with original body
    }
  }
  next();
});

app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

const { port: configPort } = require("./config");
const port = typeof configPort === "number" && !Number.isNaN(configPort) ? configPort : 4000;

function startBillingCron() {
  if (process.env.DISABLE_BILLING_CRON === "true") {
    console.log("[billing] Cron disabled (DISABLE_BILLING_CRON=true)");
    return;
  }
  try {
    const cron = require("node-cron");
    const { runBillingForAllBuyersDue } = require("./services/billing.service");
    cron.schedule(
      "59 23 * * *",
      async () => {
        try {
          const results = await runBillingForAllBuyersDue();
          const generated = results.filter((r) => !r.skipped && r.bill);
          console.log(
            `[billing] Cron 23:59 IST: processed ${results.length} buyer(s), generated ${generated.length} bill(s)`
          );
        } catch (err) {
          console.error("[billing] Cron error:", err);
        }
      },
      { timezone: "Asia/Kolkata" }
    );
    console.log("[billing] Scheduled monthly buyer bills at 23:59 IST (Asia/Kolkata)");
  } catch (e) {
    console.warn("[billing] Failed to start cron:", e?.message || e);
  }
}

async function bootstrap() {
  try {
    await connectToDatabase();
    startBillingCron();
    app.listen(port, "0.0.0.0", () => {
      console.log(`Backend listening on ${port} (accepting connections from emulator/network)`);
    });
  } catch (err) {
    console.error("[bootstrap] Failed to start server:", err);
    process.exit(1);
  }
}

void bootstrap();

