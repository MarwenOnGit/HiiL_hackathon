// ChainService — one interface, two implementations, picked by CHAIN_MODE.
// Every route calls this module and never touches ethers.js or in-memory
// fakery directly. If the local devnet misbehaves five minutes before a demo,
// flip CHAIN_MODE=mock in .env and restart — nothing else changes.
// See ARCHITECTURE.md Section 7.

const { ethers } = require("ethers");
const { randomBytes } = require("crypto");

const CONSENT_TIERS = ["UNILATERAL", "IN_PERSON_WITNESSED", "REMOTE_OTP_VERIFIED", "FULL_PLATFORM"];

const REGISTRY_ABI = [
  "function createAgreement(bytes32 contentHash, address partyB, uint8 tier, bytes32 evidenceHash, string metadataURI) returns (uint256)",
  "function sign(uint256 id)",
  "function verify(uint256 id, bytes32 contentHash) view returns (bool)",
  "function getAgreement(uint256 id) view returns (tuple(bytes32 contentHash, address partyA, address partyB, uint8 tier, bytes32 evidenceHash, string metadataURI, uint256 createdAt, bool signedA, bool signedB))",
  "function isExecuted(uint256 id) view returns (bool)",
  "function nextId() view returns (uint256)",
  "event AgreementCreated(uint256 indexed id, bytes32 contentHash, address indexed partyA, uint8 tier)",
  "event AgreementSigned(uint256 indexed id, address indexed signer)",
  "event AgreementExecuted(uint256 indexed id)"
];

function fakeTxHash() {
  return "0x" + randomBytes(32).toString("hex");
}

// ---------- mock implementation ----------
// No blockchain at all — same method signatures, same shapes back, so routes
// can't tell the difference. Useful the moment CHAIN_MODE=mock, and as the
// fallback the moment a live demo needs one.
function createMockChainService() {
  const agreements = new Map();
  let nextId = 0;

  return {
    mode: "mock",

    async createAgreement({ contentHash, partyBAddress, tier, evidenceHash, metadataURI }) {
      const id = nextId++;
      agreements.set(id, {
        contentHash,
        partyA: "0xMSMEOwnerDemoAddress",
        partyB: partyBAddress || ethers.ZeroAddress,
        tier,
        evidenceHash: evidenceHash || ethers.ZeroHash,
        metadataURI,
        createdAt: Math.floor(Date.now() / 1000),
        signedA: false,
        signedB: false
      });
      return { agreementId: id, txHash: fakeTxHash(), blockNumber: 1000 + id };
    },

    async sign({ agreementId, signerRole }) {
      const a = agreements.get(agreementId);
      if (!a) throw new Error("unknown agreement");
      if (signerRole === "partyA") a.signedA = true;
      else a.signedB = true;
      const executed = tier => (tier === "FULL_PLATFORM" ? a.signedA && a.signedB : a.signedA);
      return { txHash: fakeTxHash(), executed: executed(CONSENT_TIERS[a.tier]) };
    },

    async verify({ agreementId, contentHash }) {
      const a = agreements.get(agreementId);
      if (!a) return false;
      return a.contentHash === contentHash;
    },

    async getAgreement(agreementId) {
      const a = agreements.get(agreementId);
      if (!a) throw new Error("unknown agreement");
      return { ...a, tier: CONSENT_TIERS[a.tier] };
    },

    async isExecuted(agreementId) {
      const a = agreements.get(agreementId);
      if (!a) throw new Error("unknown agreement");
      return a.tier === 3 ? a.signedA && a.signedB : a.signedA;
    }
  };
}

// ---------- real implementation (ethers.js against a live chain) ----------
function createRealChainService(env) {
  // cacheTimeout: -1 disables ethers v6's short-lived per-call result cache.
  // Without this, two sendTransaction calls from the same wallet in quick
  // succession (e.g. createAgreement immediately followed by sign) can both
  // see a stale cached getTransactionCount("pending") result even after the
  // first transaction has already been mined — on a fast-automining local
  // Hardhat node this reliably produces "nonce too low" errors, since the
  // second transaction reuses the first transaction's now-consumed nonce.
  const provider = new ethers.JsonRpcProvider(env.RPC_URL, undefined, { cacheTimeout: -1 });
  const walletA = new ethers.Wallet(env.RELAYER_PRIVATE_KEY_A, provider); // MSME owner / relayer
  const walletB = env.RELAYER_PRIVATE_KEY_B ? new ethers.Wallet(env.RELAYER_PRIVATE_KEY_B, provider) : null; // demo counterparty

  const contractA = new ethers.Contract(env.REGISTRY_CONTRACT_ADDRESS, REGISTRY_ABI, walletA);
  const contractB = walletB ? new ethers.Contract(env.REGISTRY_CONTRACT_ADDRESS, REGISTRY_ABI, walletB) : null;

  return {
    mode: "real",
    partyAAddress: walletA.address,
    partyBAddress: walletB ? walletB.address : null,

    async createAgreement({ contentHash, partyBAddress, tier, evidenceHash, metadataURI }) {
      const tierIndex = typeof tier === "string" ? CONSENT_TIERS.indexOf(tier) : tier;
      const tx = await contractA.createAgreement(
        contentHash,
        partyBAddress || ethers.ZeroAddress,
        tierIndex,
        evidenceHash || ethers.ZeroHash,
        metadataURI || ""
      );
      const receipt = await tx.wait();
      let agreementId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contractA.interface.parseLog(log);
          if (parsed && parsed.name === "AgreementCreated") {
            agreementId = Number(parsed.args.id);
          }
        } catch (_) {
          // not our event, ignore
        }
      }
      return { agreementId, txHash: receipt.hash, blockNumber: receipt.blockNumber };
    },

    async sign({ agreementId, signerRole }) {
      const contract = signerRole === "partyA" ? contractA : contractB;
      if (!contract) throw new Error(`no wallet configured for ${signerRole}`);
      const tx = await contract.sign(agreementId);
      const receipt = await tx.wait();
      const executed = await contractA.isExecuted(agreementId);
      return { txHash: receipt.hash, executed };
    },

    async verify({ agreementId, contentHash }) {
      return contractA.verify(agreementId, contentHash);
    },

    async getAgreement(agreementId) {
      const a = await contractA.getAgreement(agreementId);
      return {
        contentHash: a.contentHash,
        partyA: a.partyA,
        partyB: a.partyB,
        tier: CONSENT_TIERS[Number(a.tier)],
        evidenceHash: a.evidenceHash,
        metadataURI: a.metadataURI,
        createdAt: Number(a.createdAt),
        signedA: a.signedA,
        signedB: a.signedB
      };
    },

    async isExecuted(agreementId) {
      return contractA.isExecuted(agreementId);
    }
  };
}

function createChainService(env = process.env) {
  if ((env.CHAIN_MODE || "mock") === "real") {
    return createRealChainService(env);
  }
  return createMockChainService();
}

module.exports = { createChainService, CONSENT_TIERS };
