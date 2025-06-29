import { Stack, StackProps, SecretValue } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
    CodeBuildStep,
    CodePipeline,
    CodePipelineSource,
    ManualApprovalStep,
    // ManualApprovalStep,
    ShellStep
} from "aws-cdk-lib/pipelines";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as iam from "aws-cdk-lib/aws-iam";

import { STAGES } from "../constants";
import {
    APPLICATION_NAME,
    AWS_S3_BUCKET_DEV_FRONTEND,
    AWS_S3_BUCKET_PROD_FRONTEND,
    DOMAIN_NAME,
    GITHUB_CDK_REPO,
    GITHUB_OWNER,
    GITHUB_PACKAGE_BRANCH,
    GITHUB_REPO,
    GITHUB_TOKEN,
    PIPELINE_NAME
} from "../configuration";
import { Deployment } from "./stage";
// import { StringParameter } from "aws-cdk-lib/aws-ssm";

export class MyPipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create the IAM Role with Admin permissions
        const source = CodePipelineSource.gitHub(
            `${GITHUB_OWNER}/${GITHUB_CDK_REPO}`,
            GITHUB_PACKAGE_BRANCH,
            {
                authentication: SecretValue.secretsManager(GITHUB_TOKEN),
                trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            }
        );

        const adminRole = new iam.Role(this, "PipelineAdminRole", {
            assumedBy: new iam.ServicePrincipal("codepipeline.amazonaws.com"),
            managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")]
        });

        const s3AccessPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
            resources: [
                `arn:aws:s3:::${AWS_S3_BUCKET_DEV_FRONTEND}/*`,
                `arn:aws:s3:::${AWS_S3_BUCKET_DEV_FRONTEND}`,
                `arn:aws:s3:::${AWS_S3_BUCKET_PROD_FRONTEND}/*`,
                `arn:aws:s3:::${AWS_S3_BUCKET_PROD_FRONTEND}`
            ]
        });

        adminRole.addToPolicy(s3AccessPolicy);

        // Create the high-level CodePipeline
        const pipeline = new CodePipeline(this, `${PIPELINE_NAME}`, {
            // artifactBucket: artifactBucket,
            pipelineName: `${PIPELINE_NAME}`,
            synth: new ShellStep("Synth", {
                input: source,
                commands: ["npm ci", "npm run build", "npx cdk synth"]
            }),
            role: adminRole,
            codeBuildDefaults: {
                rolePolicy: [
                    new iam.PolicyStatement({
                        actions: ["*"],
                        resources: ["*"]
                    })
                ]
            }
        });

        // Add source steps for both repositories
        const sourceStep = CodePipelineSource.gitHub(
            `${GITHUB_OWNER}/${GITHUB_REPO}`,
            GITHUB_PACKAGE_BRANCH,
            {
                authentication: SecretValue.secretsManager(GITHUB_TOKEN),
                trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
            }
        );

        STAGES.forEach(({ stageName, staticAssetsBucketName, tenantId, isProd, env }) => {
            // CodeBuild project
            const domain = `${stageName}.${DOMAIN_NAME}`;
            const apiDomain = `${stageName}.api.${DOMAIN_NAME}`;

            // const taigerUserPoolId = StringParameter.valueForStringParameter(
            //     this,
            //     "/auth/taigerUserPoolId"
            // );
            // const userPoolClientId = StringParameter.valueForStringParameter(
            //     this,
            //     "/auth/taigerUserPoolClientId"
            // );

            const buildStep = new CodeBuildStep(`Build-FrontEnd-${stageName}`, {
                input: sourceStep,
                installCommands: ["npm install"],
                commands: ["npm run test:ci", "npm run build"],
                env: {
                    REACT_APP_STAGE: stageName,
                    REACT_APP_PROD_URL: `https://${domain}`,
                    REACT_APP_TENANT_ID: tenantId,
                    GENERATE_SOURCEMAP: "false",
                    // REACT_APP_USER_POOL_ID: taigerUserPoolId, // Import UserPoolId from CF Output
                    // REACT_APP_USER_POOL_CLIENT_ID: userPoolClientId, // Import UserPoolClientId
                    CI: "true"
                },
                primaryOutputDirectory: "build",
                projectName: `BuildProject-${stageName}`
            });

            // // Manual approval action
            // const approvalStep = new ManualApprovalStep(`Approval-${stageName}`, {
            //     email: AWS_CODEPIPELINE_APPROVER_EMAIL
            // });

            // Add stages to the pipeline
            const Stage = new Deployment(this, `BuildDeployStage-${stageName}`, {
                stageName,
                apiDomain,
                domain,
                isProd,
                env: { region: env.region, account: env.account },
                staticAssetsBucketName
            });

            const deployStep = new ShellStep(`Deploy-FrontEnd-${stageName}`, {
                input: buildStep,
                commands: ["ls", `aws s3 sync . s3://${staticAssetsBucketName}`]
            });

            const invalidateCacheStep = new ShellStep(`InvalidateCache-${stageName}`, {
                commands: [
                    // Fetch CloudFront Distribution ID using AWS CLI
                    `CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name ${stageName}-${APPLICATION_NAME}CloudFrontStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)`,
                    // Use the fetched CloudFront ID to create invalidation
                    `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"`
                ]
            });

            const approvalStep = new ManualApprovalStep("ApproveIfStable", {
                comment:
                    "Approve to continue production deployment. Make sure every changes are verified in dev."
            });
            if (isProd) {
                pipeline.addStage(Stage, {
                    pre: [buildStep],
                    post: [deployStep, invalidateCacheStep]
                });
            } else {
                pipeline.addStage(Stage, {
                    pre: [buildStep],
                    post: [deployStep, invalidateCacheStep, approvalStep]
                });
            }
        });
    }
}
