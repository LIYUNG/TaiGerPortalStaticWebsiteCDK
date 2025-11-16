import { Stack, StackProps, SecretValue, RemovalPolicy, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
    CodeBuildStep,
    CodePipeline,
    CodePipelineSource,
    ManualApprovalStep
} from "aws-cdk-lib/pipelines";
import { PipelineType } from "aws-cdk-lib/aws-codepipeline";
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
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

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

        // Add source steps for both repositories
        const frontendSource = CodePipelineSource.gitHub(
            `${GITHUB_OWNER}/${GITHUB_REPO}`,
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

        const unitTestStep = new CodeBuildStep(`UnitTest`, {
            input: frontendSource,
            primaryOutputDirectory: ".",
            logging: {
                cloudWatch: {
                    logGroup: new LogGroup(this, `${GITHUB_REPO}UnitTest-LogGroup`, {
                        logGroupName: `/aws/codepipeline/unit-test/${GITHUB_REPO}`,
                        retention: RetentionDays.THREE_MONTHS,
                        removalPolicy: RemovalPolicy.DESTROY
                    })
                }
            },
            commands: [`npm ci`, `npm run test:ci`]
        });

        const keyPreBetafix = `/taiger/portal/backend/beta`;
        const keyPrefixProd = `/taiger/portal/backend/prod`;
        const fetchJWTSecretStep = new CodeBuildStep(`FetchJWTSecret`, {
            input: unitTestStep,
            primaryOutputDirectory: ".",
            logging: {
                cloudWatch: {
                    logGroup: new LogGroup(this, `${GITHUB_REPO}FetchJWTSecret-LogGroup`, {
                        logGroupName: `/aws/codepipeline/fetch-jwt-secret/${GITHUB_REPO}`,
                        retention: RetentionDays.THREE_MONTHS,
                        removalPolicy: RemovalPolicy.DESTROY
                    })
                }
            },
            commands: [
                `aws ssm get-parameter --name "${keyPreBetafix}/jwt-secret" --with-decryption --query "Parameter.Value" --output text > jwtSecret_beta.txt`,
                `aws ssm get-parameter --name "${keyPrefixProd}/jwt-secret" --with-decryption --query "Parameter.Value" --output text > jwtSecret_prod.txt`
            ]
        });

        // Create the high-level CodePipeline
        const pipeline = new CodePipeline(this, `${PIPELINE_NAME}`, {
            pipelineName: `${PIPELINE_NAME}`,
            pipelineType: PipelineType.V2,
            artifactBucket: new Bucket(this, `${PIPELINE_NAME}-ArtifactBucket`, {
                bucketName: `${PIPELINE_NAME}-artifact-bucket`.toLowerCase(),
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
                versioned: false,
                encryption: BucketEncryption.S3_MANAGED,
                blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                enforceSSL: true,
                lifecycleRules: [
                    {
                        expiration: Duration.days(30)
                    }
                ]
            }),
            synth: new CodeBuildStep("Synth", {
                input: source,
                additionalInputs: {
                    "../dist": fetchJWTSecretStep
                },
                logging: {
                    cloudWatch: {
                        logGroup: new LogGroup(this, `${GITHUB_REPO}Synth-LogGroup`, {
                            logGroupName: `/aws/codepipeline/synth/${GITHUB_REPO}`,
                            retention: RetentionDays.THREE_MONTHS,
                            removalPolicy: RemovalPolicy.DESTROY
                        })
                    }
                },
                commands: [
                    "npm ci",
                    "npm run build",
                    "npx cdk synth -c jwtSecret_beta=$(cat ../dist/jwtSecret_beta.txt) -c jwtSecret_prod=$(cat ../dist/jwtSecret_prod.txt)"
                ]
            }),
            role: adminRole,
            codeBuildDefaults: {
                logging: {
                    cloudWatch: {
                        logGroup: new LogGroup(this, `${PIPELINE_NAME}-LogGroup`, {
                            logGroupName: `/aws/codepipeline/${PIPELINE_NAME}`,
                            retention: RetentionDays.THREE_MONTHS,
                            removalPolicy: RemovalPolicy.DESTROY
                        })
                    }
                },
                rolePolicy: [
                    new iam.PolicyStatement({
                        actions: ["*"],
                        resources: ["*"]
                    })
                ]
            }
        });

        STAGES.forEach(
            ({
                stageName,
                staticAssetsBucketName,
                tenantId,
                isProd,
                apiOriginRegion,
                env,
                REACT_APP_GOOGLE_CLIENT_ID,
                REACT_APP_GOOGLE_REDIRECT_URL
            }) => {
                // CodeBuild project
                const domain = isProd ? `${DOMAIN_NAME}` : `${stageName}.${DOMAIN_NAME}`;
                const apiDomain = `api.ecs.${stageName}.${DOMAIN_NAME}`;
                const crmApiDomain = `api.crm.${stageName}.${DOMAIN_NAME}`;

                const buildStep = new CodeBuildStep(`Build-FrontEnd-${stageName}`, {
                    input: unitTestStep,
                    commands: ["npm run build"],
                    logging: {
                        cloudWatch: {
                            logGroup: new LogGroup(
                                this,
                                `${GITHUB_REPO}Build-FrontEnd-${stageName}-LogGroup`,
                                {
                                    logGroupName: `/aws/codepipeline/build-front-end/${GITHUB_REPO}-${stageName}`,
                                    retention: RetentionDays.THREE_MONTHS,
                                    removalPolicy: RemovalPolicy.DESTROY
                                }
                            )
                        }
                    },
                    env: {
                        REACT_APP_STAGE: stageName,
                        REACT_APP_PROD_URL: `https://${domain}`,
                        REACT_APP_TENANT_ID: tenantId,
                        REACT_APP_GOOGLE_CLIENT_ID: REACT_APP_GOOGLE_CLIENT_ID,
                        REACT_APP_GOOGLE_REDIRECT_URL: REACT_APP_GOOGLE_REDIRECT_URL,
                        GENERATE_SOURCEMAP: "false",
                        CI: "true"
                    },
                    primaryOutputDirectory: "build",
                    projectName: `BuildProject-${stageName}`
                });

                // Add stages to the pipeline
                const Stage = new Deployment(this, `BuildDeployStage-${stageName}`, {
                    stageName,
                    apiDomain,
                    crmApiDomain,
                    domain,
                    isProd,
                    apiOriginRegion: apiOriginRegion,
                    env: { region: env.region, account: env.account },
                    staticAssetsBucketName
                });

                const deployStep = new CodeBuildStep(`Deploy-FrontEnd-${stageName}`, {
                    input: buildStep,
                    commands: ["ls", `aws s3 sync . s3://${staticAssetsBucketName} --delete`],
                    logging: {
                        cloudWatch: {
                            logGroup: new LogGroup(
                                this,
                                `${GITHUB_REPO}Deploy-FrontEnd-${stageName}-LogGroup`,
                                {
                                    logGroupName: `/aws/codepipeline/deploy-front-end/${GITHUB_REPO}-${stageName}`,
                                    retention: RetentionDays.THREE_MONTHS,
                                    removalPolicy: RemovalPolicy.DESTROY
                                }
                            )
                        }
                    },
                    primaryOutputDirectory: "."
                });

                const invalidateCacheStep = new CodeBuildStep(`InvalidateCache-${stageName}`, {
                    input: deployStep,
                    commands: [
                        // Fetch CloudFront Distribution ID using AWS CLI
                        `CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name ${stageName}-${APPLICATION_NAME}CloudFrontStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)`,
                        // Use the fetched CloudFront ID to create invalidation
                        `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"`
                    ],
                    logging: {
                        cloudWatch: {
                            logGroup: new LogGroup(
                                this,
                                `${GITHUB_REPO}InvalidateCache-${stageName}-LogGroup`,
                                {
                                    logGroupName: `/aws/codepipeline/invalidate-cache/${GITHUB_REPO}-${stageName}`,
                                    retention: RetentionDays.THREE_MONTHS,
                                    removalPolicy: RemovalPolicy.DESTROY
                                }
                            )
                        }
                    }
                });

                const approvalStep = new ManualApprovalStep("ApproveIfStable", {
                    comment:
                        "Approve to continue production deployment. Make sure every changes are verified in dev."
                });
                if (isProd) {
                    pipeline.addStage(Stage, {
                        pre: [approvalStep, buildStep],
                        post: [deployStep, invalidateCacheStep]
                    });
                } else {
                    pipeline.addStage(Stage, {
                        pre: [buildStep],
                        post: [deployStep, invalidateCacheStep]
                    });
                }
            }
        );
    }
}
