#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";
import { Region } from "../constants";
import { MySlackboteStack } from "../lib/slackbot_stack";

const app = new cdk.App();

new MySlackboteStack(app, "MySlackboteStack", { env: { region: Region.IAD } });
new MyPipelineStack(app, "MyPipelineStack", { env: { region: Region.IAD } });

app.synth();
