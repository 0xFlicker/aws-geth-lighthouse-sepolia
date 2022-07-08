# Automating Ethereum Node Validator deployment on AWS

These are the deploy scripts for sepolia.0xflick.xyz-- a EL/CL Sepolia testnet RPC endpoint running on ARM64 graviton EC2 instance.

[Ethereum](https://ethereum.org/) is a community-run technology that allows you to send cryptocurrency (ETH) to anyone for a fee. The [Beacon chain](https://ethereum.org/en/upgrades/beacon-chain/) (Consensus Layer) is an upgrade to Ethereum that introduced a proof-of-stake concept to the Ethereum ecosystem.

[Lighthouse](https://github.com/sigp/lighthouse) is a consensus layer for Ethereum that supports the Beacon chain.

In this project, we introduce a [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) (AWS CDK) app that simplifies the deployment of the entire EL/CL Ethereum stack on EC2.

- If this is your first time using AWS CDK then [follow these bootstrap instructions](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).

- Clone the demo CDK application code

  `git clone https://github.com/0xflicker/aws-geth-lighthouse-sepolia`

- Change directory

  `cd cdk-rocketpool-validator-node`

- Install the CDK application

  `yarn`

- Check the [bin/geth-lighthouse.ts](./bin/geth-lighthouse.ts) and [lib/geth-lighthouse-stack.ts](./lib/geth-lighthouse-stack.ts) and make changes as necessary for you own AWS account.

- Deploy the CDK application

  `yarn cdk deploy`

# Debugging

The stack creates Cloudwatch log groups for geth and lighthouse

# Cleanup

`cdk destroy GethLighthouseStack`

# Some TODOs / Nice to haves

- [ ] Readiness checks for sync, before accepting requests from the ALB
- [ ] Snapshotting a sync'ed chain, for faster start-ups
- [ ] Exporting geth/lighthouse metrics
