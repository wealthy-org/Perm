const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const contracts = [
  ['PermRouter', 'contracts/artifacts/contracts/src/PermRouter.sol/PermRouter.json'],
  ['PermV4Adapter', 'contracts/artifacts/contracts/src/adapters/PermV4Adapter.sol/PermV4Adapter.json'],
];
for (const [name, relative] of contracts) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const minimal = {
    contractName: artifact.contractName,
    sourceName: artifact.sourceName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
  };
  fs.writeFileSync(path.join(root, `lib/web3/artifacts/${name}.json`), `${JSON.stringify(minimal)}\n`);
  console.log(`Exported ${name}`);
}
