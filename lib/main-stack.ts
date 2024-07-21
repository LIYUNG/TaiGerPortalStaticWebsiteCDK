import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { AWS_S3_BUCKET_DEV_FRONTEND } from "../configuration";
import { Stage } from "../constants";

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

        const instance = new ec2.Instance(this, `MyInstance-${stageName}`, {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
            machineImage: new ec2.AmazonLinuxImage({
                generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
            }),
            securityGroup: ec2.SecurityGroup.fromSecurityGroupId(
                this,
                `SG-${stageName}`,
                "sg-0ec6869b3bf46277c"
            ),
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
            keyPair: ec2.KeyPair.fromKeyPairName(this, `KeyPair-${stageName}`, "TaiGer_Leo_key"),
            userData: userData,
            instanceName: new Date().toISOString()
            // TODO: Security group, key pair, etc. can be added here as per your requirements
        });

        // Define the S3 bucket (replace with your actual bucket details)
        const bucket = s3.Bucket.fromBucketAttributes(this, `ExistingBucket-${stageName}`, {
            ...env,
            bucketArn
        });

        // Define the ACM certificate
        const certificate = certificatemanager.Certificate.fromCertificateArn(
            this,
            "Certificate",
            "arn:aws:acm:us-east-1:669131042313:certificate/1e76088b-1331-4df1-93ea-f5fd69e8e25a"
        );

        // Create the CloudFront distribution
        new cloudfront.Distribution(this, `MyDistribution-${stageName}`, {
            defaultBehavior: {
                origin: new origins.S3Origin(bucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress: true
            },
            additionalBehaviors: {
                "/api/*": {
                    origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
                        httpPort: 80,
                        httpsPort: 443,
                        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                        originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
                        connectionAttempts: 3,
                        connectionTimeout: cdk.Duration.seconds(10)
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    compress: true
                },
                "/auth/*": {
                    origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
                        httpPort: 80,
                        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                        connectionAttempts: 3,
                        connectionTimeout: cdk.Duration.seconds(10)
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    compress: true
                },
                "/images/*": {
                    origin: new origins.HttpOrigin(instance.instancePublicDnsName, {
                        httpPort: 80,
                        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
                        connectionAttempts: 3,
                        connectionTimeout: cdk.Duration.seconds(10)
                    }),
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
    }
}
