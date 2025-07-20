import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

import { APPLICATION_NAME, DOMAIN_NAME } from "../configuration";
import { Stage } from "../constants/stages";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";

interface CloudFrontStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
    apiDomain: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}

export class CloudFrontStack extends cdk.Stack {
    public readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
        super(scope, id, props);

        // Ensure props is defined and destructure safely
        const stageName = props.stageName;

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
            `${APPLICATION_NAME}-OriginBucketRequest-${props.stageName}`,
            {
                functionName: `${APPLICATION_NAME}-OriginBucketRequest-${props.stageName}`,
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
                architecture: cdk.aws_lambda.Architecture.X86_64
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
        // Create the CloudFront distribution
        this.distribution = new cloudfront.Distribution(
            this,
            `TaiGerPortalStaticWebsiteDistribution-${stageName}`,
            {
                defaultBehavior: {
                    origin: s3Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
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
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: acceptEncodingCachePolicy,
                        originRequestPolicy,
                        compress: true
                    },
                    "/auth/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                        originRequestPolicy,
                        compress: true
                    },
                    "/images/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                        originRequestPolicy,
                        compress: true
                    }
                },
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
