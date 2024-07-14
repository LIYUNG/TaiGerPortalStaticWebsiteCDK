import {
    Stack,
    StackProps,
    // Duration,
    // RemovalPolicy,
    SecretValue
} from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as s3 from "aws-cdk-lib/aws-s3";
// import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from "aws-cdk-lib/aws-iam";
import { STAGES } from "../constants";
import {
    AWS_CODEPIPELINE_APPROVER_EMAIL,
    GITHUB_OWNER,
    GITHUB_PACKAGE_BRANCH,
    GITHUB_REPO,
    GITHUB_TOKEN,
    PIPELINE_NAME
} from "../configuration";

export class MyPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Define the pipeline
        const pipeline = new codepipeline.Pipeline(this, "Pipeline", {
            pipelineName: PIPELINE_NAME
        });

        // CodePipeline Artifact
        const sourceOutput = new codepipeline.Artifact();

        // GitHub source action
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: "Hello-World",
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            oauthToken: SecretValue.secretsManager(GITHUB_TOKEN),
            output: sourceOutput,
            branch: GITHUB_PACKAGE_BRANCH,
            trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
        });

        pipeline.addStage({ stageName: "Source", actions: [sourceAction] });

        STAGES.forEach(({ stageName, account, bucket, apiDomain, cloudfrontId }) => {
            // Reference existing S3 bucket
            const existingBucket = s3.Bucket.fromBucketName(
                this,
                `ExistingBucket-${stageName}`,
                bucket
            );

            // CodeBuild project
            const buildProject = new codebuild.PipelineProject(this, `Build-${stageName}`, {
                environment: {
                    buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
                    environmentVariables: {
                        REACT_APP_STAGE: { value: stageName },
                        REACT_APP_PROD_URL: { value: apiDomain }
                    }
                },
                buildSpec: codebuild.BuildSpec.fromObject({
                    version: "0.2",
                    phases: {
                        install: {
                            runtimeVersions: {
                                nodejs: "18"
                            },
                            commands: ["npm install"]
                        },
                        build: {
                            commands: ["npm run build"]
                        }
                    },
                    artifacts: {
                        "base-directory": "build",
                        files: ["**/*"]
                    }
                })
            });

            // Build action
            const buildAction = new codepipeline_actions.CodeBuildAction({
                actionName: `Build-${stageName}`,
                project: buildProject,
                input: sourceOutput,
                outputs: [new codepipeline.Artifact()]
            });

            // Deploy action to S3
            const deployAction = new codepipeline_actions.S3DeployAction({
                actionName: `Deploy-${stageName}`,
                bucket: existingBucket,
                input: buildAction?.actionProperties?.outputs![0]
            });

            // Manual approval action
            const approvalAction = new codepipeline_actions.ManualApprovalAction({
                actionName: `Approval-${stageName}`,
                notifyEmails: [AWS_CODEPIPELINE_APPROVER_EMAIL]
            });

            // CodeBuild project for CloudFront cache invalidation
            const invalidateCacheProject = new codebuild.PipelineProject(
                this,
                `InvalidateCacheProject-${stageName}`,
                {
                    environment: {
                        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4
                    },
                    buildSpec: codebuild.BuildSpec.fromObject({
                        version: "0.2",
                        phases: {
                            build: {
                                commands: [
                                    // Replace with AWS CLI command to invalidate CloudFront cache
                                    `aws cloudfront create-invalidation --distribution-id ${cloudfrontId} --paths "/*"`
                                ]
                            }
                        }
                    })
                }
            );

            // Add the necessary permissions to the CodeBuild project's role
            invalidateCacheProject.addToRolePolicy(
                new iam.PolicyStatement({
                    actions: ["cloudfront:CreateInvalidation"],
                    resources: [`arn:aws:cloudfront::${account}:distribution/${cloudfrontId}`]
                })
            );

            const invalidationCloudfrontAction = new codepipeline_actions.CodeBuildAction({
                actionName: `Invalidate_Cache-${stageName}`,
                project: invalidateCacheProject,
                input: sourceOutput
            });

            // Add actions to pipeline stages
            pipeline.addStage({
                stageName: `Build-${stageName}`,
                actions: [buildAction, approvalAction]
            });
            pipeline.addStage({
                stageName: `Deploy-${stageName}`,
                actions: [deployAction, invalidationCloudfrontAction]
            });
        });
    }
}
