const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("MSMEContractRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log(`MSMEContractRegistry deployed to: ${address}`);
  console.log(`Network: ${hre.network.name}`);

  const outDir = path.join(__dirname, "..");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "deployment.json"),
    JSON.stringify({ address, network: hre.network.name, deployedAt: new Date().toISOString() }, null, 2)
  );
  console.log("Wrote contracts/deployment.json — start.sh copies the address into web/.env.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
