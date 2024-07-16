#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";
import { Region } from "../constants";

const app = new cdk.App();

new MyPipelineStack(app, "MyPipelineStack", { env: { region: Region.IAD } });

app.synth();
