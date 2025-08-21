#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MyServerlessApplicationStack } from "../lib/my-serverless-application-stack";
import { CanaryDeploymentStack } from "../lib/canary-deployment-stack";

const app = new cdk.App();

new MyServerlessApplicationStack(app, "MyServerlessApplicationStack");
new CanaryDeploymentStack(app, "CanaryDeploymentStack");

app.synth();
