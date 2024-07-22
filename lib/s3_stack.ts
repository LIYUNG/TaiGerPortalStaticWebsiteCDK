import { StackProps, RemovalPolicy, NestedStack } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";

export interface S3StackProps extends StackProps {
    stageName: string;
}
export class S3Stack extends NestedStack {
    readonly s3: s3.IBucket;
    constructor(scope: Construct, id: string, props?: S3StackProps) {
        super(scope, id, props);

        // Create a KMS key
        const kmsKey = new kms.Key(this, `KMSKey-${props?.stageName}`, {
            enableKeyRotation: true
        });

        // Create an S3 bucket in the primary region with KMS encryption
        this.s3 = new s3.Bucket(this, `taigerpipeline-artifact-${props?.stageName}`, {
            bucketName: `taigerpipeline-artifact-${props?.stageName}`.toLowerCase(),
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: kmsKey,
            removalPolicy: RemovalPolicy.DESTROY
        });
    }
}
