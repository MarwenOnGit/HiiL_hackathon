const { expect } = require("chai");
const { ethers } = require("hardhat");

function parseCreatedEvent(receipt, registry) {
  for (const log of receipt.logs) {
    try {
      const parsed = registry.interface.parseLog(log);
      if (parsed && parsed.name === "AgreementCreated") return parsed;
    } catch (_) {
      // not one of ours, skip
    }
  }
  throw new Error("AgreementCreated event not found in receipt");
}

describe("MSMEContractRegistry", function () {
  let registry, owner, partyB, stranger;
  const ConsentTier = { UNILATERAL: 0, IN_PERSON_WITNESSED: 1, REMOTE_OTP_VERIFIED: 2, FULL_PLATFORM: 3 };

  beforeEach(async function () {
    [owner, partyB, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("MSMEContractRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  it("creates an agreement and stores the fields correctly", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("contract text v1"));
    const tx = await registry.createAgreement(hash, partyB.address, ConsentTier.UNILATERAL, ethers.ZeroHash, "ipfs://demo");
    const receipt = await tx.wait();
    const { args } = parseCreatedEvent(receipt, registry);

    const agreement = await registry.getAgreement(args.id);
    expect(agreement.contentHash).to.equal(hash);
    expect(agreement.partyA).to.equal(owner.address);
    expect(agreement.partyB).to.equal(partyB.address);
    expect(agreement.tier).to.equal(ConsentTier.UNILATERAL);
  });

  it("verifies content hash correctly and detects tampering", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("original text"));
    const tx = await registry.createAgreement(hash, partyB.address, ConsentTier.UNILATERAL, ethers.ZeroHash, "ipfs://demo");
    const receipt = await tx.wait();
    const { args } = parseCreatedEvent(receipt, registry);

    expect(await registry.verify(args.id, hash)).to.equal(true);
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("tampered text"));
    expect(await registry.verify(args.id, tamperedHash)).to.equal(false);
  });

  it("UNILATERAL tier executes on partyA's signature alone", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("unilateral agreement"));
    const tx = await registry.createAgreement(hash, ethers.ZeroAddress, ConsentTier.UNILATERAL, ethers.ZeroHash, "ipfs://demo");
    const receipt = await tx.wait();
    const { args } = parseCreatedEvent(receipt, registry);

    expect(await registry.isExecuted(args.id)).to.equal(false);
    await expect(registry.connect(owner).sign(args.id))
      .to.emit(registry, "AgreementExecuted")
      .withArgs(args.id);
    expect(await registry.isExecuted(args.id)).to.equal(true);
  });

  it("FULL_PLATFORM tier needs both signatures before it's executed", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("full platform agreement"));
    const tx = await registry.createAgreement(hash, partyB.address, ConsentTier.FULL_PLATFORM, ethers.ZeroHash, "ipfs://demo");
    const receipt = await tx.wait();
    const { args } = parseCreatedEvent(receipt, registry);

    await registry.connect(owner).sign(args.id);
    expect(await registry.isExecuted(args.id)).to.equal(false);

    await expect(registry.connect(partyB).sign(args.id))
      .to.emit(registry, "AgreementExecuted")
      .withArgs(args.id);
    expect(await registry.isExecuted(args.id)).to.equal(true);
  });

  it("rejects a signer who is not a party to the agreement", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("agreement"));
    const tx = await registry.createAgreement(hash, partyB.address, ConsentTier.FULL_PLATFORM, ethers.ZeroHash, "ipfs://demo");
    const receipt = await tx.wait();
    const { args } = parseCreatedEvent(receipt, registry);

    await expect(registry.connect(stranger).sign(args.id)).to.be.revertedWithCustomError(registry, "NotAParty");
  });

  it("reverts on an unknown agreement id", async function () {
    await expect(registry.getAgreement(999)).to.be.revertedWithCustomError(registry, "UnknownAgreement");
  });
});
