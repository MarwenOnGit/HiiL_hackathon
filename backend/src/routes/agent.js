// Proxy to the Python agent service (ARCHITECTURE.md Section 3 — "the seam").
//
// Every call here crosses a process boundary to a service that can be slow,
// restarting, or absent. None of that may take the demo down, so each request
// carries a timeout and a graceful failure path: a clear JSON error with a
// hint, never a hung request and never a stack trace.

const express = require("express");
const multer = require("multer");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5001";
// Hardening walks the whole pipeline, so it gets the longest budget. Everything
// else should be fast; if it isn't, something is wrong and we want to know
// rather than wait.
const TIMEOUTS = { harden: 30000, default: 10000 };

function unavailable(res, err, hint) {
  console.error("[agent]", err.message);
  const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
  return res.status(503).json({
    error: timedOut ? "the agent service timed out" : "the agent service is unreachable",
    detail: err.message,
    hint: hint || `Is it running? Expected at ${AGENT_URL}. Start it with ./start.sh, or run the demo without analysis.`,
    agent_available: false
  });
}

async function callAgent(path, { method = "GET", body, headers, timeout } = {}) {
  const response = await fetch(`${AGENT_URL}${path}`, {
    method,
    body,
    headers,
    signal: AbortSignal.timeout(timeout || TIMEOUTS.default)
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (e) {
    parsed = { error: "agent returned a non-JSON response", detail: text.slice(0, 400) };
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

// Cheap liveness check the frontend polls before offering the v3 flow, so the
// UI can say "analysis unavailable" instead of failing on the first click.
router.get("/health", async (req, res) => {
  try {
    const { body } = await callAgent("/health", { timeout: 3000 });
    res.json({ agent_available: true, ...body });
  } catch (err) {
    res.json({
      agent_available: false,
      corpus_size: 0,
      grounding_available: false,
      detail: err.message
    });
  }
});

router.post("/harden", upload.single("file"), async (req, res) => {
  try {
    const form = new FormData();
    if (req.file) {
      form.append("file", new Blob([req.file.buffer]), req.file.originalname || "contract.txt");
    } else if (req.body && req.body.text) {
      form.append("text", req.body.text);
    } else {
      return res.status(400).json({ error: "upload a file or post text" });
    }
    form.append("contract_id", (req.body && req.body.contract_id) || `contract_${Date.now()}`);
    form.append("profile", (req.body && req.body.profile) || "supply");

    const { ok, status, body } = await callAgent("/harden", {
      method: "POST", body: form, timeout: TIMEOUTS.harden
    });
    res.status(ok ? 200 : status).json(body);
  } catch (err) {
    unavailable(res, err);
  }
});

// Generic passthrough for the remaining agent routes. Kept narrow on purpose:
// only these prefixes are forwarded, so the proxy can never become an open
// relay into the agent service.
const FORWARD = [
  { method: "post", path: "/contracts/:id/accept", to: (p) => `/contracts/${p.id}/accept` },
  { method: "post", path: "/contracts/:id/sign", to: (p) => `/contracts/${p.id}/sign` },
  { method: "get", path: "/contracts/:id", to: (p) => `/contracts/${p.id}` },
  { method: "get", path: "/contracts/:id/history", to: (p) => `/contracts/${p.id}/history` },
  { method: "get", path: "/contracts/:id/verify", to: (p) => `/contracts/${p.id}/verify` },
  { method: "post", path: "/disputes", to: () => "/disputes" },
  { method: "post", path: "/admin/reset", to: () => "/admin/reset" }
];

for (const route of FORWARD) {
  router[route.method](route.path, async (req, res) => {
    try {
      const isPost = route.method === "post";
      const { ok, status, body } = await callAgent(route.to(req.params), {
        method: route.method.toUpperCase(),
        body: isPost ? JSON.stringify(req.body || {}) : undefined,
        headers: isPost ? { "Content-Type": "application/json" } : undefined
      });
      res.status(ok ? 200 : status).json(body);
    } catch (err) {
      unavailable(res, err);
    }
  });
}

module.exports = router;
