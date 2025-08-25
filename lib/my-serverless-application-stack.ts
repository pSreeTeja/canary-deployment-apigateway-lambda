import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_apigateway as apigw,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class MyServerlessApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Lambda function (Python)
    const fn = new lambda.Function(this, 'HelloFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src')),
    });

    // Publish a new version each deploy
    const newVersion = new lambda.Version(this, `Version-${Date.now()}`, {
      lambda: fn,
      description: `Auto version at ${new Date().toISOString()}`,
    });

    // Stable alias (prod) — always points to last stable
    const prodAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: fn.currentVersion,
    });

    // Canary alias — always points to the new version
    const canaryAlias = new lambda.Alias(this, 'CanaryAlias', {
      aliasName: 'canary',
      version: newVersion,
    });

    // API Gateway (low-level) so we can use stage variables
    const api = new apigw.CfnRestApi(this, 'Api', {
      name: 'canary-api',
      endpointConfiguration: { types: ['REGIONAL'] },
    });

    // Resource: /hello
    const hello = new apigw.CfnResource(this, 'HelloResource', {
      restApiId: api.ref,
      parentId: api.attrRootResourceId,
      pathPart: 'hello',
    });

    // Integration URI with stage variable to pick alias dynamically
    const integrationUri = `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${this.region}:${this.account}:function:${fn.functionName}:\\\${stageVariables.lambdaAlias}/invocations`;

    // Method
    const method = new apigw.CfnMethod(this, 'HelloAnyMethod', {
      restApiId: api.ref,
      resourceId: hello.ref,
      httpMethod: 'ANY',
      authorizationType: 'NONE',
      integration: {
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: integrationUri,
      },
    });

    // Deployment - depends on method
    const deployment = new apigw.CfnDeployment(this, 'Deployment', {
      restApiId: api.ref,
    });
    deployment.addDependency(method);

    // Stage with canary settings
    new apigw.CfnStage(this, 'Stage', {
      restApiId: api.ref,
      stageName: 'prod',
      deploymentId: deployment.ref,
      variables: {
        lambdaAlias: 'prod',
      },
      canarySetting: {
        percentTraffic: 0.1, // 10% traffic goes to canary
        stageVariableOverrides: {
          lambdaAlias: 'canary',
        },
        useStageCache: false,
      },
    });

    // Permissions: allow API Gateway to invoke aliases
    fn.addPermission('InvokeByApiGatewayProd', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.ref}/*/*/hello`,
    });
  }
}
