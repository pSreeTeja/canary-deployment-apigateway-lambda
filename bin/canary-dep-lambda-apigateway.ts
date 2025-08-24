#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { MyServerlessApplicationStack } from "../lib/my-serverless-application-stack";

const app = new cdk.App();

new MyServerlessApplicationStack(app, "MyServerlessApplicationStack");

app.synth();
