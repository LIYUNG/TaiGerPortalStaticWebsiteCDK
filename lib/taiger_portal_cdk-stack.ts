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
import { Stage } from "../constants";

export class TaiGerPortalCdkStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // The code that defines your stack goes here

        // example resource
        // const queue = new sqs.Queue(this, 'TaiGerPortalCdkQueue', {
        //   visibilityTimeout: Duration.seconds(300)
        // });

        // Reference existing S3 bucket
        const existingBucketName = "taiger-file-storage-development-website";
        const existingBucket = s3.Bucket.fromBucketName(this, "ExistingBucket", existingBucketName);

        // const prodBucketName = "taiger-file-storage-development-website";
        // const prodBucket = s3.Bucket.fromBucketName(this, "ExistingBucket", prodBucketName);

        // CodePipeline Artifact
        const sourceOutput = new codepipeline.Artifact();

        // GitHub source action
        const sourceAction = new codepipeline_actions.GitHubSourceAction({
            actionName: "Hello-World",
            owner: "LIYUNG", // Replace with your GitHub username
            repo: "React-Hello-World", // Replace with your GitHub repo name
            // oauthToken: SecretValue.secretsManager('GITHUB_TOKEN_NAME'), // GitHub token stored in AWS Secrets Manager
            oauthToken: SecretValue.secretsManager(
                "arn:aws:secretsmanager:us-east-1:669131042313:secret:beta/taigerportal-Hm1SLX"
            ), // GitHub token stored in AWS Secrets Manager
            output: sourceOutput,
            branch: "main", // Replace with your branch name
            trigger: codepipeline_actions.GitHubTrigger.WEBHOOK
        });

        // CodeBuild project
        interface BuildProjectProps {
            stage: string;
            prodUrl: string;
        }
        const createBuildProject = (props: BuildProjectProps): codebuild.PipelineProject => {
            const { stage, prodUrl } = props;

            return new codebuild.PipelineProject(this, `BuildProject-${stage}`, {
                environment: {
                    buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
                    environmentVariables: {
                        REACT_APP_STAGE: { value: stage }, // Set the stage environment variable
                        REACT_APP_PROD_URL: { value: prodUrl }
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
        };

        const buildBetaProject = createBuildProject({
            stage: Stage.Beta_FE,
            prodUrl: "https://integ.taigerconsultancy-portal.com"
        });

        // const buildProdProject = createBuildProject({
        //     stage: Stage.Prod_NA,
        //     prodUrl: "https://integ.taigerconsultancy-portal.com"
        // });

        // Build action
        const buildBetaAction = new codepipeline_actions.CodeBuildAction({
            actionName: "Build",
            project: buildBetaProject,
            input: sourceOutput,
            outputs: [new codepipeline.Artifact()]
        });

        const buildBetaApprovalAction = new codepipeline_actions.ManualApprovalAction({
            actionName: `Approval-${Stage.Beta_FE}`,
            notifyEmails: ["taiger.leoc@gmail.com"] // Optional: Notify email addresses for approval
        });

        // const buildProdAction = new codepipeline_actions.CodeBuildAction({
        //     actionName: "Build-Prod",
        //     project: buildProdProject,
        //     input: sourceOutput,
        //     outputs: [new codepipeline.Artifact()]
        // });

        // const buildProdApprovalAction = new codepipeline_actions.ManualApprovalAction({
        //     actionName: `Approval-${Stage.Prod_NA}`,
        //     notifyEmails: ["taiger.leoc@gmail.com"] // Optional: Notify email addresses for approval
        // });

        // CodeBuild project for CloudFront cache invalidation
        const invalidateCacheProject = new codebuild.PipelineProject(
            this,
            "InvalidateCacheProject",
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
                                'aws cloudfront create-invalidation --distribution-id E140WBRXPYSUB4 --paths "/*"'
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
                resources: [
                    `arn:aws:cloudfront::${props?.env?.account}:distribution/E140WBRXPYSUB4`
                ]
            })
        );
        const invalidationCloudfrontAction = new codepipeline_actions.CodeBuildAction({
            actionName: "Invalidate_Cache",
            project: invalidateCacheProject,
            input: sourceOutput
        });

        // Deploy to Beta
        const betaDeployAction = new codepipeline_actions.S3DeployAction({
            actionName: "Beta_Deploy",
            bucket: existingBucket,
            input: buildBetaAction?.actionProperties?.outputs![0]
        });

        // // Deploy to Prod
        // const prodDeployAction = new codepipeline_actions.S3DeployAction({
        //     actionName: "Prod_Deploy",
        //     bucket: prodBucket,
        //     input: buildProdAction?.actionProperties?.outputs![0]
        // });

        // Define the pipeline
        new codepipeline.Pipeline(this, "Pipeline", {
            stages: [
                {
                    stageName: "Source",
                    actions: [sourceAction]
                },
                {
                    stageName: "Build",
                    actions: [buildBetaAction, buildBetaApprovalAction]
                },
                {
                    stageName: "Beta_Deploy",
                    actions: [betaDeployAction, invalidationCloudfrontAction]
                }
                // {
                //   stageName: 'Prod_Deploy',
                //   actions: [prodDeployAction],
                // },
            ]
        });
    }
}
