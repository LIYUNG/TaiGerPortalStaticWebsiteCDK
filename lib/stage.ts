import { Stage, type StageProps } from "aws-cdk-lib";
import { type Construct } from "constructs";
import { MainStack } from "./main-stack";

// Main deployment setup. Collection of the stacks and deployment sequence
interface DeploymentkProps extends StageProps {
    stageName: string;
    bucketArn?: string;
}

export class Deployment extends Stage {
    constructor(scope: Construct, id: string, props: DeploymentkProps) {
        super(scope, id, props);
        // Deploy the main stack in the Deployment stage
        new MainStack(this, `MainStack-${props.stageName}`, {
            stageName: props?.stageName,
            bucketArn: props?.bucketArn,
            env: props.env,
            description: "Create EC2, S3, Cloudfront"
        });
    }
}
