import {
  Stack,
  StackProps,
  // Duration,
  RemovalPolicy,
  SecretValue,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

export class TaiGerPortalCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'TaiGerPortalCdkQueue', {
    //   visibilityTimeout: Duration.seconds(300)
    // });

    // Reference existing S3 bucket
    const existingBucketName = 'taiger-file-storage-development-website';
    const existingBucket = s3.Bucket.fromBucketName(
      this,
      'ExistingBucket',
      existingBucketName
    );

    // const prodBucket = new s3.Bucket(this, 'ProdBucket', {
    //   bucketName: 'taiger-file-storage-production-website',
    //   versioned: false,
    // });

    // CodePipeline Artifact
    const sourceOutput = new codepipeline.Artifact();

    // GitHub source action
    const sourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'Hello-World',
      owner: 'LIYUNG', // Replace with your GitHub username
      repo: 'React-Hello-World', // Replace with your GitHub repo name
      // oauthToken: SecretValue.secretsManager('GITHUB_TOKEN_NAME'), // GitHub token stored in AWS Secrets Manager
      oauthToken: SecretValue.secretsManager(
        'arn:aws:secretsmanager:us-east-1:669131042313:secret:beta/taigerportal-Hm1SLX'
      ), // GitHub token stored in AWS Secrets Manager
      output: sourceOutput,
      branch: 'main', // Replace with your branch name
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
    });

    // CodeBuild project
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            runtimeVersions: {
              nodejs: '18',
            },
          },
          pre_build: {
            commands: [
              // 'cd client', // Navigate to the subdirectory
              'npm install',
            ],
          },
          build: {
            commands: ['npm run build'],
          },
        },
        artifacts: {
          // 'base-directory': 'client/build', // Adjust base directory to the subdirectory's build folder
          'base-directory': 'build', // specify the base directory where build artifacts are located
          files: ['**/*'], // include all files and subdirectories under 'build'
        },
      }),
    });

    // Build action
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build',
      project: buildProject,
      input: sourceOutput,
      outputs: [new codepipeline.Artifact()],
    });

    // CodeBuild project for CloudFront cache invalidation
    const invalidateCacheProject = new codebuild.PipelineProject(
      this,
      'InvalidateCacheProject',
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_4,
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
            build: {
              commands: [
                // Replace with AWS CLI command to invalidate CloudFront cache
                'aws cloudfront create-invalidation --distribution-id E140WBRXPYSUB4 --paths "/*"',
              ],
            },
          },
        }),
      }
    );
    // Add the necessary permissions to the CodeBuild project's role
    invalidateCacheProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::${props?.env?.account}:distribution/E140WBRXPYSUB4`,
        ],
      })
    );
    const invalidationCloudfrontAction =
      new codepipeline_actions.CodeBuildAction({
        actionName: 'Invalidate_Cache',
        project: invalidateCacheProject,
        input: sourceOutput,
      });

    // Deploy to Beta
    const betaDeployAction = new codepipeline_actions.S3DeployAction({
      actionName: 'Beta_Deploy',
      bucket: existingBucket,
      input: buildAction?.actionProperties?.outputs![0],
    });

    // // Deploy to Prod
    // const prodDeployAction = new codepipeline_actions.S3DeployAction({
    //   actionName: 'Prod_Deploy',
    //   bucket: prodBucket,
    //   input: buildAction.actionProperties.outputs[0],
    // });

    // Define the pipeline
    new codepipeline.Pipeline(this, 'Pipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Beta_Deploy',
          actions: [betaDeployAction, invalidationCloudfrontAction],
        },
        // {
        //   stageName: 'Prod_Deploy',
        //   actions: [prodDeployAction],
        // },
      ],
    });
  }
}
