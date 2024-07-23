#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";
import { Region, Stage } from "../constants";
import { MySlackboteStack } from "../lib/slackbot_stack";
import { S3Stack } from "../lib/s3_stack";

const app = new cdk.App();

const s3Beta = new S3Stack(app, "S3StackBeta", {
    env: { region: Region.IAD },
    stageName: Stage.Beta_FE
});

const s3Prod = new S3Stack(app, "S3StackProd", {
    env: { region: Region.NRT },
    stageName: Stage.Prod_NA
});

new MySlackboteStack(app, "MySlackboteStack", {
    env: { region: Region.IAD }
});
const myPipelineStack = new MyPipelineStack(app, "MyPipelineStack", {
    env: { region: Region.IAD }
});

myPipelineStack.addDependency(s3Prod);
myPipelineStack.addDependency(s3Beta);

app.synth();
