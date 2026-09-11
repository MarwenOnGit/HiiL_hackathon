const express = require("express");
const { ethers } = require("ethers");
const db = require("../db");
const { demoRelationship } = require("../data/demoRelationship");
const insaf = require("../services/insaf");

const router = express.Router();

// Stands in for "Agent 1 finished ingesting and extracting" until the real
// RAG/extraction agent-service exists. Same output shape either way
// (ARCHITECTURE.md Section 6.1), so this route can be swapped for a real
// call later without touching anything downstream.
router.post("/demo", (req, res) => {
  const relationship = demoRelationship();
  relationship.raw_thread_hash = ethers.keccak256(
    ethers.toUtf8Bytes(relationship.evidence.map((e) => e.excerpt).join("\n"))
  );
  db.saveRelationship(relationship);
  res.json({ relationship, insaf: insaf.onExtraction(relationship) });
});

router.get("/:id", (req, res) => {
  const relationship = db.getRelationship(req.params.id);
  if (!relationship) return res.status(404).json({ error: "relationship not found" });
  res.json({ relationship });
});

module.exports = router;
