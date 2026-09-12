const express = require("express");
const db = require("../db");
const registry = require("../services/contractsRegistry");
const { requireMsme } = require("../services/sessionAuth");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ rows: db.dashboardRows(), chain_mode: req.app.locals.chainService.mode });
});

// The v3 owner-scoped dashboard: every contract this MSME user owns (from
// BOTH worlds), each with thread + invitation state, resolved throo the
// registry so the agent being down never breaks the wizard rows.
router.get("/mine", requireMsme, async (req, res) => {
  const rows = await registry.listMine(req.auth.user.user_id);
  res.json({ rows, chain_mode: req.app.locals.chainService.mode });
});

module.exports = router;
