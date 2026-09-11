const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ rows: db.dashboardRows(), chain_mode: req.app.locals.chainService.mode });
});

module.exports = router;
