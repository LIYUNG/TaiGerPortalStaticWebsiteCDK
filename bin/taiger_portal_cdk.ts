#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { MyPipelineStack } from "../lib/pipeline_stack";

const app = new cdk.App();

new MyPipelineStack(app, "MyPipelineStack");

app.synth();
