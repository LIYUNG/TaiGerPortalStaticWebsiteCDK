import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import {
    API_BETA_DOMAINNAME,
    API_PROD_DOMAINNAME,
    AWS_S3_BUCKET_DEV_FRONTEND,
    DOMAIN_NAME
} from "../configuration";
import { Region, Stage } from "../constants";

interface MainStackProps extends cdk.StackProps {
    stageName?: string;
    bucketArn?: string;
}
export class MainStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: MainStackProps) {
        super(scope, id, props);

        // Ensure props is defined and destructure safely
        const stageName = props?.stageName ?? Stage.Beta_FE;
        const bucketArn = props?.bucketArn ?? AWS_S3_BUCKET_DEV_FRONTEND;
        const env = props?.env;
        // Get the existing VPC
        const vpc = new ec2.Vpc(this, `Vpc-${stageName}`, {
            maxAzs: 3, // Default is all AZs in the region
            natGateways: 0, // Number of NAT Gateways
            subnetConfiguration: [
                {
                    name: "Public",
                    subnetType: ec2.SubnetType.PUBLIC
                },
                {
                    name: "Private",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
                },
                {
                    name: "Isolated",
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED
                }
            ]
        });

        // Define User Data script
        const userData = ec2.UserData.forLinux();
        userData.addCommands(
            "sudo yum update -y",
            "sudo yum install -y awscli",
            "mkdir taiger_express_server", //   create folder
            "cd taiger_express_server", //Download the file from S3 bucket
            "aws s3 sync s3://taiger-file-storage-production-backend-server .",
            "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -",
            "sudo yum install -y nodejs",
            "cd /taiger_express_server/python/TaiGerTranscriptAnalyzerJS",
            "sudo yum install -y python3-pip",
            "sudo /bin/python3 -m pip install -r /taiger_express_server/python/TaiGerTranscriptAnalyzerJS/requirements.txt",
            "cd /taiger_express_server",
            "sudo chown -R $USER /taiger_express_server", // grant create folder permission
            "sudo npm install",
            "sudo npm install pm2 -g",
            "sudo pm2 startup", // Start the Node.js server
            "sudo pm2 start npm -- start",
            "sudo pm2 save"
        );
        // Import the existing IAM role using its ARN
        const existingRole = iam.Role.fromRoleArn(
            this,
            "ExistingRole",
            "arn:aws:iam::669131042313:role/ec2_taiger_test_infra"
        );
        const securityGroupCloudFrontOnly = new ec2.SecurityGroup(this, `SG-${stageName}`, {
            vpc,
            allowAllOutbound: true
        });
        let awsManagedPrefixListId;
        let domain = "";
        if (env?.region === Region.NRT) {
            // Prod
            awsManagedPrefixListId = "pl-82a045eb";
            domain = API_PROD_DOMAINNAME;
        } else {
            awsManagedPrefixListId = "pl-3b927c52";
            domain = API_BETA_DOMAINNAME;
        }

        const awsManagedPrefix = ec2.PrefixList.fromPrefixListId(
            this,
            `cloudFrontOriginPrefixList=${stageName}`,
            awsManagedPrefixListId
        );

        securityGroupCloudFrontOnly.addIngressRule(
            ec2.Peer.prefixList(awsManagedPrefix.prefixListId),
            ec2.Port.tcp(80)
        );
        const keyPair = new ec2.KeyPair(this, `Pipeline-${stageName}`, {
            keyPairName: `KeyPair-CICD-${stageName}`
        });

        // Get the public subnets from the VPC
        const publicSubnets = vpc.selectSubnets({
            subnetType: ec2.SubnetType.PUBLIC
        });

        const instance = new ec2.Instance(this, `MyInstance-${stageName}`, {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
            machineImage: new ec2.AmazonLinuxImage({
                cpuType: ec2.AmazonLinuxCpuType.ARM_64,
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
            }),
            securityGroup: securityGroupCloudFrontOnly,
            blockDevices: [
                {
                    deviceName: "/dev/xvda",
                    volume: cdk.aws_ec2.BlockDeviceVolume.ebs(8, {
                        volumeType: cdk.aws_ec2.EbsDeviceVolumeType.GP3,
                        iops: 3000,
                        encrypted: false
                    })
                }
            ],
            role: existingRole,
            keyPair: keyPair,
            userData: userData,
            vpcSubnets: publicSubnets,
            instanceName: new Date().toISOString()
            // TODO: Security group, key pair, etc. can be added here as per your requirements
        });

        // Define the S3 bucket (replace with your actual bucket details)
        const bucket = s3.Bucket.fromBucketAttributes(this, `ExistingBucket-${stageName}`, {
            ...env,
            bucketArn
        });

        // Create an Origin Access Identity (OAI)
        const oai = new cloudfront.OriginAccessIdentity(this, `OAI-${stageName}`, {
            comment: `OAI for ${stageName} CloudFront distribution`
        });

        // Grant the OAI read access to the bucket
        const bucketPolicy = new iam.PolicyStatement({
            actions: ["s3:GetObject"],
            resources: [`${bucketArn}/*`],
            principals: [
                new iam.CanonicalUserPrincipal(oai.cloudFrontOriginAccessIdentityS3CanonicalUserId)
            ]
        });

        bucket.addToResourcePolicy(bucketPolicy);

        // Define the ACM certificate
        const certificate = certificatemanager.Certificate.fromCertificateArn(
            this,
            "Certificate",
            "arn:aws:acm:us-east-1:669131042313:certificate/44845b4a-61c2-4b9c-8d80-755890a1838e"
        );

        // Look up the existing hosted zone for your domain
        const hostedZone = route53.HostedZone.fromLookup(this, `MyHostedZone-${stageName}`, {
            domainName: DOMAIN_NAME // Your domain name
        });

        const ec2Origin = new origins.HttpOrigin(instance.instancePublicDnsName, {
            httpPort: 80,
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
            connectionAttempts: 3,
            connectionTimeout: cdk.Duration.seconds(10)
        });
        // Create the CloudFront distribution
        const distribution = new cloudfront.Distribution(this, `MyDistribution-${stageName}`, {
            defaultBehavior: {
                origin: new origins.S3Origin(bucket, { originAccessIdentity: oai }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress: true
            },
            additionalBehaviors: {
                "/api/*": {
                    origin: ec2Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    compress: true
                },
                "/auth/*": {
                    origin: ec2Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    compress: true
                },
                "/images/*": {
                    origin: ec2Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress: true
                }
            },
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 403,
                    responsePagePath: "/index.html",
                    ttl: cdk.Duration.seconds(0)
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: "/index.html",
                    ttl: cdk.Duration.seconds(0)
                }
            ],
            domainNames: ["test.taigerconsultancy-portal.com"],
            certificate: certificate,
            priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL
        });

        // Create a CNAME record for the subdomain
        new route53.CnameRecord(this, `MyCnameRecord-${stageName}`, {
            zone: hostedZone,
            recordName: domain, // Your subdomain
            domainName: distribution.distributionDomainName
        });
    }
}
