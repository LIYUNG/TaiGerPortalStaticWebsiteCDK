import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
// import * as ec2 from "aws-cdk-lib/aws-ec2";
// import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
// import * as logs from "aws-cdk-lib/aws-logs";
// import * as sns from "aws-cdk-lib/aws-sns";
// import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
// import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { DOMAIN_NAME } from "../configuration";
import { Region } from "../constants";

interface MainStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
    apiDomain: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}
export class MainStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: MainStackProps) {
        super(scope, id, props);

        // Ensure props is defined and destructure safely
        const stageName = props.stageName;
        // const isProd = props.isProd;
        const env = props?.env;

        // // Create a CloudWatch Log Group
        // const logGroup = new logs.LogGroup(this, `TaiGerLogGroup-${stageName}`, {
        //     logGroupName: `/aws/taiger-portal-log-group-${stageName}`,
        //     retention: logs.RetentionDays.SIX_MONTHS, // Set the retention period as needed
        //     removalPolicy: cdk.RemovalPolicy.RETAIN // Automatically delete log group on stack deletion
        // });

        // // Create a CloudWatch Log Stream
        // new logs.LogStream(this, `MyLogStream-${stageName}`, {
        //     logGroup: logGroup,
        //     logStreamName: `taiger-portal-server-stream-${stageName}`,
        //     removalPolicy: cdk.RemovalPolicy.RETAIN // Automatically delete log stream on stack deletion
        // });

        // Get the existing VPC
        // const vpc = new ec2.Vpc(this, `Vpc-${stageName}`, {
        //     maxAzs: 3, // Default is all AZs in the region
        //     natGateways: 0, // Number of NAT Gateways
        //     subnetConfiguration: [
        //         {
        //             name: "Public",
        //             subnetType: ec2.SubnetType.PUBLIC
        //         },
        //         {
        //             name: "Private",
        //             subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        //         },
        //         {
        //             name: "Isolated",
        //             subnetType: ec2.SubnetType.PRIVATE_ISOLATED
        //         }
        //     ]
        // });

        // Define User Data script
        // const userData = ec2.UserData.forLinux();
        // userData.addCommands(
        //     "sudo yum update -y",
        //     "sudo yum install -y awscli",
        //     "mkdir taiger_express_server", //   create folder
        //     "cd taiger_express_server", // Download the file from S3 bucket
        //     "aws s3 sync s3://taiger-file-storage-production-backend-server .", // Download server code
        //     isProd
        //         ? "aws s3 sync s3://taiger-environment-variables/.env.production ."
        //         : "aws s3 sync s3://taiger-environment-variables/.env.development .", // Download environment file
        //     "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -",
        //     "sudo yum install -y nodejs",
        //     "cd /taiger_express_server/python/TaiGerTranscriptAnalyzerJS",
        //     "sudo yum install -y python3-pip",
        //     "sudo /bin/python3 -m pip install -r /taiger_express_server/python/TaiGerTranscriptAnalyzerJS/requirements.txt",
        //     "cd /taiger_express_server",
        //     "sudo chown -R $USER /taiger_express_server", // grant create folder permission
        //     "sudo npm install",
        //     "sudo npm install pm2 -g",
        //     "sudo pm2 startup", // Start the Node.js server
        //     isProd ? "sudo pm2 start npm -- start" : "sudo pm2 start npm -- run-script dev",
        //     "sudo pm2 save"
        // );
        // Import the existing IAM role using its ARN
        // const existingRole = iam.Role.fromRoleArn(
        //     this,
        //     "ExistingRole",
        //     "arn:aws:iam::669131042313:role/ec2_taiger_test_infra"
        // );
        // const securityGroupCloudFrontOnly = new ec2.SecurityGroup(this, `SG-${stageName}`, {
        //     vpc,
        //     allowAllOutbound: true
        // });
        // let awsManagedPrefixListId;
        if (env?.region === Region.NRT) {
            // Prod
            // awsManagedPrefixListId = "pl-82a045eb";
        } else {
            // awsManagedPrefixListId = "pl-3b927c52";
        }

        // const awsManagedPrefix = ec2.PrefixList.fromPrefixListId(
        //     this,
        //     `cloudFrontOriginPrefixList=${stageName}`,
        //     awsManagedPrefixListId
        // );

        // securityGroupCloudFrontOnly.addIngressRule(
        //     ec2.Peer.prefixList(awsManagedPrefix.prefixListId),
        //     ec2.Port.tcp(80)
        // );
        // const keyPair = new ec2.KeyPair(this, `Pipeline-${stageName}`, {
        //     keyPairName: `KeyPair-CICD-${stageName}`
        // });

        // // Get the public subnets from the VPC
        // const publicSubnets = vpc.selectSubnets({
        //     subnetType: ec2.SubnetType.PUBLIC
        // });

        // const instance = new ec2.Instance(this, `MyInstance-${stageName}`, {
        //     vpc,
        //     instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.NANO),
        //     machineImage: new ec2.AmazonLinuxImage({
        //         cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        //         generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
        //     }),
        //     securityGroup: securityGroupCloudFrontOnly,
        //     blockDevices: [
        //         {
        //             deviceName: "/dev/xvda",
        //             volume: cdk.aws_ec2.BlockDeviceVolume.ebs(8, {
        //                 volumeType: cdk.aws_ec2.EbsDeviceVolumeType.GP3,
        //                 iops: 3000,
        //                 encrypted: false
        //             })
        //         }
        //     ],
        //     role: existingRole,
        //     keyPair: keyPair,
        //     userData: userData,
        //     vpcSubnets: publicSubnets,
        //     instanceName: new Date().toISOString()
        //     // TODO:  can be added here as per your requirements
        // });

        // // Define the SNS topic
        // const alarmTopic = new sns.Topic(this, `AlarmTopic-${stageName}`, {
        //     displayName: `Alarm notifications for ${stageName}`
        // });

        // alarmTopic.addSubscription(new subscriptions.EmailSubscription("taiger.leoc@gmail.com"));

        // // Define the CloudWatch alarm for NetworkIn metric
        // const networkInAlarm = new cloudwatch.Alarm(this, `NetworkInAlarm-${stageName}`, {
        //     metric: new cloudwatch.Metric({
        //         namespace: "AWS/EC2",
        //         metricName: "NetworkIn",
        //         dimensionsMap: {
        //             InstanceId: instance.instanceId
        //         },
        //         statistic: "sum",
        //         period: cdk.Duration.minutes(5)
        //     }),
        //     threshold: 5000,
        //     evaluationPeriods: 1,
        //     comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
        //     alarmDescription: `Alarm when NetworkIn is less than or equal to 5000 for ${stageName}`,
        //     alarmName: `NetworkInAlarm-${stageName}`,
        //     datapointsToAlarm: 1
        // });

        // // Add the SNS topic as an alarm action
        // networkInAlarm.addAlarmAction({
        //     bind: () => ({
        //         alarmActionArn: alarmTopic.topicArn
        //     })
        // });

        // S3 Bucket for static website hosting
        const websiteBucket = new s3.Bucket(this, `TaiGer-Frontend-Bucket-${stageName}`, {
            bucketName: props.staticAssetsBucketName,
            enforceSSL: true,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: "index.html",
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete bucket during stack teardown (optional)
            autoDeleteObjects: true // Automatically delete objects during stack teardown (optional)
        });

        const oac = new cloudfront.S3OriginAccessControl(this, `OAC-${stageName}`, {
            signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
        });

        const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
            originAccessControl: oac
        });

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

        // Define a custom cache policy
        const cachePolicy = new cloudfront.CachePolicy(this, `CustomCachePolicy-${stageName}`, {
            cachePolicyName: `CustomCachePolicy-${stageName}`,
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList("q"),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            cookieBehavior: cloudfront.CacheCookieBehavior.allowList("x-auth"),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true
        });

        // const ec2Origin = new origins.HttpOrigin(instance.instancePublicDnsName, {
        //     httpPort: 80,
        //     protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        //     originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        //     connectionAttempts: 3,
        //     connectionTimeout: cdk.Duration.seconds(10)
        // });

        // Construct the full URL for the API Gateway (use the appropriate URL format)
        const apiUrl = `https://${props.apiDomain}`;

        const apiGatewayOrigin = new origins.HttpOrigin(apiUrl);

        // Create the CloudFront distribution
        const distribution = new cloudfront.Distribution(
            this,
            `TaiGerPortalStaticWebsiteDistribution-${stageName}`,
            {
                defaultBehavior: {
                    origin: s3Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress: true
                },
                additionalBehaviors: {
                    "/api/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cachePolicy,
                        compress: true
                    },
                    "/auth/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cachePolicy,
                        compress: true
                    },
                    "/images/*": {
                        origin: apiGatewayOrigin,
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
                domainNames: [props.domain],
                certificate: certificate,
                priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL
            }
        );

        // Create a CNAME record for the subdomain
        new route53.CnameRecord(this, `TaiGerPortalStaticWebsiteCnameRecord-${stageName}`, {
            zone: hostedZone,
            recordName: props.domain, // Your subdomain
            domainName: distribution.distributionDomainName
        });
    }
}
