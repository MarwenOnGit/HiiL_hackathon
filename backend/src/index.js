require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { createChainService } = require("./services/chainService");
const relationshipsRouter = require("./routes/relationships");
const contractsRouter = require("./routes/contracts");
const dashboardRouter = require("./routes/dashboard");
const confirmRouter = require("./routes/confirm");
const agentRouter = require("./routes/agent");
const threadsRouter = require("./routes/threads");
const insaf = require("./services/insaf");

const app = express();
app.use(cors());
app.use(express.json());

app.locals.chainService = createChainService(process.env);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    chain_mode: app.locals.chainService.mode,
    insaf: insaf.idle()
  });
});

app.use("/api/relationships", relationshipsRouter);
app.use("/api/contracts", contractsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/confirm", confirmRouter);
app.use("/api/threads", threadsRouter);
// v3 analysis layer — proxied to the Python agent service (ARCHITECTURE.md §3)
app.use("/api/agent", agentRouter);

// Serve the static frontend (see ../../frontend) so the whole demo runs from
// one process: `node src/index.js`, then open http://localhost:4000
const frontendDir = path.join(__dirname, "..", "..", "frontend");
app.use(express.static(frontendDir));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MSME backend listening on http://localhost:${PORT}`);
  console.log(`Chain mode: ${app.locals.chainService.mode}`);
  if (app.locals.chainService.mode === "mock") {
    console.log("Running in mock chain mode — no real blockchain calls. Set CHAIN_MODE=real in .env once a local node + deployed contract are ready.");
  }
});
