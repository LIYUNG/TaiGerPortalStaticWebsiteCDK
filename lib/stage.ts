import { Stage, type StageProps } from "aws-cdk-lib";
import { type Construct } from "constructs";
import { CloudFrontStack } from "./cloudfront-stack";
import { CognitoStack } from "./cognito-stack";

// Main deployment setup. Collection of the stacks and deployment sequence
interface DeploymentkProps extends StageProps {
    stageName: string;
    domain: string;
    apiDomain: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}

export class Deployment extends Stage {
    constructor(scope: Construct, id: string, props: DeploymentkProps) {
        super(scope, id, props);
        // Deploy the main stack in the Deployment stage

        new CloudFrontStack(this, `CloudFrontStack-${props.stageName}`, {
            stageName: props.stageName,
            staticAssetsBucketName: props.staticAssetsBucketName,
            apiDomain: props.apiDomain,
            domain: props.domain,
            isProd: props?.isProd,
            env: props.env,
            description: "Create S3, Cloudfront"
        });

        new CognitoStack(this, `CognitoStack-${props.stageName}`, {
            stageName: props.stageName,
            domain: props.domain,
            env: props.env,
            description: "Create TaiGer user pool S3"
        });
    }
}
