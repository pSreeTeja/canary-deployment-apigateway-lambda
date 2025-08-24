import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_apigateway as apigw,
  CfnOutput,
  Duration
  } from 'aws-cdk-lib';
  import { Construct } from 'constructs';
  import * as path from 'path';
  
  
  export class MyServerlessApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
  super(scope, id, props);
  
  
  // 1) Lambda function (Python)
  const fn = new lambda.Function(this, 'HelloFn', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'index.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
  });
  
  
  // 2) Publish a new version each deploy (timestamp guarantees uniqueness)
  const newVersion = new lambda.Version(this, `Version-${Date.now()}`, {
    lambda: fn,
    description: `Auto version at ${new Date().toISOString()}`
  });
  
  
  // 3) Stable alias (points to initial version, won’t move unless promoted)
  const prodAlias = new lambda.Alias(this, 'ProdAlias', {
  aliasName: 'prod',
  version: fn.currentVersion
  });
  
  
  // 4) Canary alias always moves to new version
  const canaryAlias = new lambda.Alias(this, 'CanaryAlias', {
  aliasName: 'canary',
  version: newVersion
  });
  
  
  // 5) REST API (low-level) so we can use stage variables + explicit canary settings
  const api = new apigw.CfnRestApi(this, 'Api', {
  name: 'canary-api',
  endpointConfiguration: { types: ['REGIONAL'] }
  });
  
  
  // /hello resource
  const hello = new apigw.CfnResource(this, 'HelloResource', {
  restApiId: api.ref,
  parentId: api.attrRootResourceId,
  pathPart: 'hello'
  });
  
  
  // Integration URI with stage variable to pick alias
  const integrationUri = `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${this.region}:${this.account}:function:${fn.functionName}:\\\${stageVariables.lambdaAlias}/invocations`;
  
  const method = new apigw.CfnMethod(this, 'HelloAnyMethod', {
  restApiId: api.ref,
  resourceId: hello.ref,
  httpMethod: 'ANY',
  authorizationType: 'NONE',
  integration: {
  type: 'AWS_PROXY',
  integrationHttpMethod: 'POST',
  uri: integrationUri
  }
  });
}
}