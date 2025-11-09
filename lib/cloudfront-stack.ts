import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

import { APPLICATION_NAME, AWS_ACCOUNT, DOMAIN_NAME } from "../configuration";
import { Stage } from "../constants/stages";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

interface CloudFrontStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
    apiOriginRegion: string;
    apiDomain: string;
    crmApiDomain: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}

export class CloudFrontStack extends cdk.Stack {
    public readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
        super(scope, id, props);

        // Ensure props is defined and destructure safely
        const stageName = props.stageName;
        const awsRegion = props.region;
        const jwtSecret = this.node.tryGetContext(`jwtSecret_${stageName}`) || "123";

        // S3 Bucket for static website hosting
        const websiteBucket = new s3.Bucket(this, `TaiGer-Frontend-Bucket-${stageName}`, {
            bucketName: props.staticAssetsBucketName,
            enforceSSL: true,
            publicReadAccess: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete bucket during stack teardown (optional)
            autoDeleteObjects: true // Automatically delete objects during stack teardown (optional)
        });

        const edgeBucketRequestFunction = new NodejsFunction(
            this,
            `${APPLICATION_NAME}-OriginBucketRequest-${stageName}`,
            {
                functionName: `${APPLICATION_NAME}-OriginBucketRequest-${stageName}`,
                runtime: Runtime.NODEJS_20_X,
                handler: "handler",
                entry: "src/bucketRequest.ts",
                description: "Rewrites non-file paths to /index.html",
                bundling: {
                    esbuildArgs: { "--bundle": true },
                    target: "es2020",
                    platform: "node",
                    minify: true
                },
                logGroup: new LogGroup(
                    this,
                    `${APPLICATION_NAME}-OriginBucketRequest-${stageName}-LogGroup`,
                    {
                        logGroupName: `/aws/lambda/${APPLICATION_NAME}-OriginBucketRequest-${stageName}-${awsRegion}`,
                        retention: RetentionDays.SIX_MONTHS,
                        removalPolicy: RemovalPolicy.DESTROY
                    }
                ),
                architecture: cdk.aws_lambda.Architecture.X86_64
            }
        );
        const edgeRequestFunctionRole = new cdk.aws_iam.Role(
            this,
            "SecureOriginInterceptorEdgeLambdaRole",
            {
                assumedBy: new cdk.aws_iam.CompositePrincipal(
                    new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
                    new cdk.aws_iam.ServicePrincipal("edgelambda.amazonaws.com")
                ),
                managedPolicies: [
                    cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
                        "service-role/AWSLambdaBasicExecutionRole"
                    )
                ],
                //this role in case no value is provided
                roleName: `${APPLICATION_NAME}-OriginRequest-${stageName}-Role`
            }
        );

        const invokeApiPolicy = new PolicyStatement({
            sid: "AllowInvokeApiGateway",
            effect: Effect.ALLOW,
            actions: ["execute-api:Invoke"],
            resources: [`arn:aws:execute-api:${props.apiOriginRegion}:${AWS_ACCOUNT}:*/*/*/*`]
        });

        edgeRequestFunctionRole.addToPolicy(invokeApiPolicy);

        const edgeOriginRequestFunction = new NodejsFunction(
            this,
            `${APPLICATION_NAME}-OriginRequest-${stageName}`,
            {
                functionName: `${APPLICATION_NAME}-OriginRequest-${stageName}`,
                description: "Lambda@Edge function for origin request of TaiGer Portal",
                runtime: Runtime.NODEJS_20_X,
                entry: "src/originRequest.ts",
                handler: "handler",
                bundling: {
                    define: {
                        "process.env.JWT_SECRET": JSON.stringify(jwtSecret),
                        "process.env.AWS_REGION": JSON.stringify(props.apiOriginRegion)
                    },
                    esbuildArgs: { "--bundle": true },
                    target: "es2020",
                    platform: "node",
                    externalModules: [],
                    minify: true
                },
                currentVersionOptions: {
                    removalPolicy: cdk.RemovalPolicy.DESTROY
                },
                architecture: cdk.aws_lambda.Architecture.X86_64,
                memorySize: 128,
                timeout: cdk.Duration.seconds(3),
                tracing: Tracing.ACTIVE,
                role: edgeRequestFunctionRole
            }
        );

        const oac = new cloudfront.S3OriginAccessControl(
            this,
            `${APPLICATION_NAME}-OAC-${stageName}`,
            {
                signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
            }
        );

        const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
            originAccessControl: oac
        });

        // Look up the existing hosted zone for your domain
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            `${APPLICATION_NAME}-HostedZone-${stageName}`,
            {
                domainName: DOMAIN_NAME // Your domain name
            }
        );

        // Define the ACM certificate
        const certificate = new certificatemanager.Certificate(
            this,
            `${APPLICATION_NAME}-Certificate-${props.stageName}`,
            {
                certificateName: `${APPLICATION_NAME}-Certificate-${props.stageName}`,
                domainName: props.domain,
                validation: certificatemanager.CertificateValidation.fromDns(hostedZone)
            }
        );

        const originRequestPolicy = new cloudfront.OriginRequestPolicy(
            this,
            `${APPLICATION_NAME}-OriginRequestPolicy-${props.stageName}`,
            {
                originRequestPolicyName: `taiger-portal-origin-request-policy-${props.stageName}`,
                headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList("tenantid"),
                queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(), // Forward all query strings
                cookieBehavior: cloudfront.OriginRequestCookieBehavior.all()
            }
        );
        // Construct the full URL for the API Gateway (use the appropriate URL format)
        const apiGatewayOrigin = new origins.HttpOrigin(props.apiDomain);

        const crmApiGatewayOrigin = new origins.HttpOrigin(props.crmApiDomain);

        // no cahcing:
        const acceptEncodingCachePolicy = new cloudfront.CachePolicy(
            this,
            `${APPLICATION_NAME}-CachePolicy-${props.stageName}`,
            {
                cachePolicyName: `gzip-accept-encoding-${props.stageName}`,
                defaultTtl: Duration.seconds(0),
                minTtl: Duration.seconds(0),
                maxTtl: Duration.seconds(1),
                enableAcceptEncodingGzip: true
            }
        );

        const apiResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
            this,
            `TaiGerPortalApiResponseHeadersPolicy-${props.stageName}`,
            {
                responseHeadersPolicyName: `taiger-portal-api-response-headers-${props.stageName}`,
                corsBehavior: {
                    accessControlAllowCredentials: true,
                    accessControlAllowOrigins: ["http://localhost:3006"], // ✅ Explicitly allow frontend
                    accessControlAllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                    accessControlAllowHeaders: ["Authorization", "Content-Type", "X-auth"],
                    accessControlExposeHeaders: ["Authorization"], // If API returns auth headers
                    originOverride: true // Ensures this header is always set
                }
            }
        );

        // Create an S3 bucket for CloudFront logs
        const loggingBucket = new s3.Bucket(
            this,
            `${APPLICATION_NAME}-CloudFrontLoggingBucket-${props.stageName}`,
            {
                bucketName:
                    `${APPLICATION_NAME}-CloudFrontLoggingBucket-${props.stageName}`.toLowerCase(),
                blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
                encryption: s3.BucketEncryption.KMS_MANAGED,
                enforceSSL: true,
                objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
                lifecycleRules: [
                    {
                        expiration: cdk.Duration.days(90) // auto-expire logs after 90 days
                    }
                ]
            }
        );

        // Grant CloudFront permission to write logs
        loggingBucket.addToResourcePolicy(
            new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                principals: [new cdk.aws_iam.ServicePrincipal("cloudfront.amazonaws.com")],
                actions: ["s3:PutObject"],
                resources: [loggingBucket.arnForObjects("cloudfront-logs/*")],
                conditions: {
                    StringEquals: {
                        "AWS:SourceAccount": AWS_ACCOUNT // tighten to your account
                    }
                }
            })
        );

        // Create the CloudFront distribution
        this.distribution = new cloudfront.Distribution(
            this,
            `TaiGerPortalStaticWebsiteDistribution-${stageName}`,
            {
                defaultRootObject: "index.html", // CloudFront.1 compliance - specify default root object
                defaultBehavior: {
                    origin: s3Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    edgeLambdas: [
                        {
                            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
                            functionVersion: edgeBucketRequestFunction.currentVersion
                        }
                    ],
                    compress: true
                },
                additionalBehaviors: {
                    "/api/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: acceptEncodingCachePolicy,
                        originRequestPolicy,
                        compress: true
                    },
                    "/auth/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                        originRequestPolicy,
                        compress: true
                    },
                    "/images/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                        originRequestPolicy,
                        compress: true
                    },
                    "/crm-api/*": {
                        origin: crmApiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                        originRequestPolicy,
                        ...(!props.isProd && {
                            responseHeadersPolicy: apiResponseHeadersPolicy
                        }),
                        edgeLambdas: [
                            {
                                eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
                                functionVersion: edgeOriginRequestFunction.currentVersion
                            }
                        ],
                        compress: true
                    }
                },
                logBucket: loggingBucket,
                logFilePrefix: "cloudfront-logs/", // optional prefix
                domainNames: [props.domain],
                certificate: certificate,
                priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL
            }
        );

        if (props.stageName === Stage.PROD) {
            // Create a CNAME record for the subdomain
            new route53.ARecord(this, `TaiGerPortalStaticWebsiteCnameRecord-${stageName}`, {
                zone: hostedZone,
                recordName: props.domain, // Your subdomain
                target: route53.RecordTarget.fromAlias(new CloudFrontTarget(this.distribution))
            });
        } else {
            // Create a CNAME record for the subdomain
            new route53.CnameRecord(this, `TaiGerPortalStaticWebsiteCnameRecord-${stageName}`, {
                zone: hostedZone,
                recordName: props.domain, // Your subdomain
                domainName: this.distribution.distributionDomainName
            });
        }

        // Output the CloudFront distribution ID
        new cdk.CfnOutput(this, "CloudFrontDistributionId", {
            value: this.distribution.distributionId,
            exportName: `CloudFrontDistributionId-${props.stageName}`
        });
    }
}
