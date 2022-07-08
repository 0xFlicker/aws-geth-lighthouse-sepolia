import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as log from "aws-cdk-lib/aws-logs";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import { aws_ssm as ssm, Duration } from "aws-cdk-lib";
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
} from "aws-cdk-lib/aws-autoscaling";
declare const content: any;

export interface IProps extends cdk.StackProps {
  domain: string | [string, string];
}

export class GethLighthouseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IProps) {
    const { domain, ...rest } = props;
    super(scope, id, rest);

    const cfnDocument = new ssm.CfnDocument(this, "SepoliaNodeSession", {
      content: {
        schemaVersion: "1.0",
        description: "Sepolia RPC",
        sessionType: "Standard_Stream",
        inputs: {
          runAsEnabled: true,
          runAsDefaultUser: "ec2-user",
          idleSessionTimeout: "20",
          shellProfile: {
            linux: "cd ~ && bash",
          },
        },
      },
      name: "sepolia-rpc",
      documentFormat: "JSON",
      documentType: "Session",
    });

    // Create new VPC with 2 Subnets
    const vpc = new ec2.Vpc(this, "VPC", {
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "asterisk",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Allow outbound access
    // No port 22 access, connections managed by AWS Systems Manager Session Manager

    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      description: "Node security group.",
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(30303),
      "allow ETH1 P2P port: 30303"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9000),
      "allow ETH2 P2P port: 9000"
    );

    const role = new iam.Role(this, "ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchAgentServerPolicy")
    );

    // Use Latest Amazon Linux Image - CPU Type ARM64
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    });

    // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
    const userData = ec2.UserData.forLinux();

    const asg = new autoscaling.AutoScalingGroup(this, "asg", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.M6G,
        ec2.InstanceSize.LARGE
      ),
      machineImage: ami,
      userData,
      role: role,
      securityGroup,
      minCapacity: 1,
      maxCapacity: 1,

      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(16, {
            volumeType: EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    // Create an asset that will be used as part of User Data to run on first load
    const config = new Asset(this, "Config", {
      path: path.join(__dirname, "../src/config.sh"),
    });

    const configPath = userData.addS3DownloadCommand({
      bucket: config.bucket,
      bucketKey: config.s3ObjectKey,
    });
    userData.addExecuteFileCommand({
      filePath: configPath,
      arguments: "",
    });

    config.grantRead(asg.role);

    const settings = new Asset(this, "Settings", {
      path: path.join(__dirname, "../src/sepolia.ini"),
    });
    const cloudwatchConfiguration = new Asset(this, "CloudWatchConfiguration", {
      path: path.join(__dirname, "../src/cloudwatch.config.json"),
    });
    userData.addS3DownloadCommand({
      bucket: settings.bucket,
      bucketKey: settings.s3ObjectKey,
      localFile: "/home/ec2-user/sepolia.ini",
    });
    userData.addS3DownloadCommand({
      bucket: cloudwatchConfiguration.bucket,
      bucketKey: cloudwatchConfiguration.s3ObjectKey,
      localFile: "/opt/amazon-cloudwatch-agent.json",
    });
    settings.grantRead(role);
    cloudwatchConfiguration.grantRead(role);

    // Install node to run on Prater test network
    const install = [
      `/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/amazon-cloudwatch-agent.json`,
      `runuser -l  ec2-user -c 'cd /home/ec2-user && geth --sepolia --config ./sepolia.ini --http --authrpc.jwtsecret /etc/jwt/jwt-secret 2>> /home/ec2-user/geth.stderr.log 1>> /home/ec2-user/geth.stdout.log & sleep 10 && lighthouse bn --network sepolia --jwt-secrets /etc/jwt/jwt-secret --execution-endpoints http://localhost:8551 --eth1-endpoints http://localhost:8545 --eth1 2>> /home/ec2-user/lighthouse.stderr.log 1>> /home/ec2-user/lighthouse.stdout.log'`,
    ];

    userData.addCommands(...install);

    new log.LogGroup(this, "geth-stdout", {
      retention: log.RetentionDays.TWO_WEEKS,
      logGroupName: "sepolia-geth--stdout-log",
    });
    new log.LogGroup(this, "lighthouse-stdout", {
      retention: log.RetentionDays.TWO_WEEKS,
      logGroupName: "sepolia-lighthouse--stdout-log",
    });
    new log.LogGroup(this, "geth-stderr", {
      retention: log.RetentionDays.ONE_MONTH,
      logGroupName: "sepolia-geth--stderr-log",
    });
    new log.LogGroup(this, "lighthouse-stderr", {
      retention: log.RetentionDays.ONE_MONTH,
      logGroupName: "sepolia-lighthouse--stderr-log",
    });

    // Domain
    const domains = domain instanceof Array ? domain : [domain];
    const domainName = domains.join(".");
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domains.length === 2 ? domains[1] : domains[0],
    });

    const certificate = new acm.DnsValidatedCertificate(this, "certificate", {
      domainName: domainName,
      hostedZone: hostedZone,
      region: props.env?.region,
    });

    const lb = new elb.ApplicationLoadBalancer(this, "lb", {
      vpc,
      internetFacing: true,
    });

    const listener = lb.addListener("Listener", {
      port: 443,
      open: true,
      certificates: [certificate],
    });
    listener.addTargets("Target", {
      port: 8545,
      protocol: elb.ApplicationProtocol.HTTP,
      targets: [asg],
    });

    new route53.ARecord(this, "ipv4-record", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(lb)
      ),
      ttl: Duration.seconds(60),
    });
    new route53.AaaaRecord(this, "ipv6-record", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(lb)
      ),
      ttl: Duration.seconds(60),
    });

    // // Create outputs for connecting
    // new cdk.CfnOutput(this, "ssh command", {
    //   value:
    //     "aws ssm start-session --target " +
    //     ec2Instance.instanceId +
    //     " --document-name ",
    // });
  }
}
