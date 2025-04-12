import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

import { DOMAIN_NAME } from "../configuration";
import { Stage } from "../constants/stages";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";

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

        const originRequestPolicy = new cloudfront.OriginRequestPolicy(
            this,
            "TaiGerPortalOriginRequestPolicy",
            {
                originRequestPolicyName: `taiger-portal-origin-request-policy-${props.stageName}`,
                headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList("tenantid"),
                queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(), // Forward all query strings
                cookieBehavior: cloudfront.OriginRequestCookieBehavior.all()
            }
        );
        // Construct the full URL for the API Gateway (use the appropriate URL format)
        const apiGatewayOrigin = new origins.HttpOrigin(props.apiDomain);

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
                    compress: true
                },
                additionalBehaviors: {
                    "/api/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
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
                errorResponses: [
                    {
                        httpStatus: 403,
                        responseHttpStatus: 403,
                        responsePagePath: "/index.html",
                        ttl: cdk.Duration.seconds(0)
                    }
                ],
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
