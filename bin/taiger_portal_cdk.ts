#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";
import { Region, Stage } from "../constants";
import { MySlackboteStack } from "../lib/slackbot_stack";
import { S3Stack } from "../lib/s3_stack";
import { AWS_ACCOUNT } from "../configuration";

const app = new cdk.App();

const s3Beta = new S3Stack(app, "S3StackBeta", {
    env: { region: Region.IAD, account: AWS_ACCOUNT },
    stageName: Stage.Beta_FE
});

const s3Prod = new S3Stack(app, "S3StackProd", {
    env: { region: Region.NRT, account: AWS_ACCOUNT },
    stageName: Stage.Prod_NA
});

new MySlackboteStack(app, "MySlackboteStack", {
    env: { region: Region.IAD, account: AWS_ACCOUNT }
});
const myPipelineStack = new MyPipelineStack(app, "MyPipelineStack", {
    env: { region: Region.IAD, account: AWS_ACCOUNT },
    s3Buckets: [s3Beta, s3Prod],
    crossRegionReferences: true
});

myPipelineStack.addDependency(s3Prod);
myPipelineStack.addDependency(s3Beta);

app.synth();
