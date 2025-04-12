#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";
import { Region } from "../constants";
import { MySlackboteStack } from "../lib/slackbot_stack";
import { AWS_ACCOUNT } from "../configuration";

const app = new cdk.App();

new MySlackboteStack(app, "TaiGerSlackboteStack", {
    env: { region: Region.US_EAST_1, account: AWS_ACCOUNT }
});

new MyPipelineStack(app, "TaiGerPortalStaticWebsitePipelineStack", {
    env: { region: Region.US_EAST_1, account: AWS_ACCOUNT },
    crossRegionReferences: true
});

app.synth();
