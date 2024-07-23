import { StackProps, RemovalPolicy, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";

export interface S3StackProps extends StackProps {
    stageName: string;
}
export class S3Stack extends Stack {
    readonly s3: s3.IBucket;
    readonly kmsKey: kms.Key;
    constructor(scope: Construct, id: string, props?: S3StackProps) {
        super(scope, id, props);

        // Create a KMS key
        this.kmsKey = new kms.Key(this, `KMSKey-${props?.stageName}`, {
            removalPolicy: RemovalPolicy.DESTROY,
            alias: `taigerpipeline-artifact-kms-${props?.stageName}`,
            enableKeyRotation: true
        });

        // // Store the KMS Key ARN in SSM Parameter Store
        // new ssm.StringParameter(this, "KmsKeyArnParameter", {
        //     parameterName: `taigerpipeline-artifact-kms-${props?.stageName}`,
        //     stringValue: this.kmsKey.keyArn
        // });

        // // Export the KMS Key ARN
        // new CfnOutput(this, "KmsKeyArn", {
        //     value: this.kmsKey.keyArn,
        //     exportName: `taigerpipeline-artifact-kms-${props?.stageName}`
        // });

        // Create an S3 bucket in the primary region with KMS encryption
        this.s3 = new s3.Bucket(this, `taigerpipeline-artifact-${props?.stageName}`, {
            bucketName: `taigerpipeline-artifact-${props?.stageName}`.toLowerCase(),
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: this.kmsKey,
            removalPolicy: RemovalPolicy.DESTROY
        });
    }
}
