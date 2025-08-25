import {
  Stack,
  StackProps,
  CfnParameter,
  CfnOutput,
  Duration,
  aws_lambda as lambda,
  aws_apigateway as apigw,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

export class MyServerlessApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ========= 1) Lambda (Python) =========
    const fn = new lambda.Function(this, 'HelloFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../src')),
      memorySize: 256,
      timeout: Duration.seconds(10),
    });

    // ========= 2) Publish exactly ONE new version per deploy =========
    // Using a timestamp in the description guarantees a new version on code/config change
    const publishedVersion = new lambda.Version(this, `PublishedVersion-${Date.now()}`, {
      lambda: fn,
      description: `Auto-published at ${new Date().toISOString()}`,
    });

    // Expose the new version number (you'll use this when promoting prod)
    new CfnOutput(this, 'CanaryVersionNumber', { value: publishedVersion.version });

    // ========= 3) Aliases =========
    // Prod alias points to a parameterized version number that stays sticky across updates.
    // Default is "1" (first publish). This avoids the "double publish in one deploy" problem.
    const prodVersionNumber = new CfnParameter(this, 'ProdVersionNumber', {
      type: 'String',
      default: '1', // first deploy commonly yields version 1
      description:
        'Version number that prod alias should point to. Stickiness across updates lets canary advance while prod stays stable. Promote by updating this value.',
    });

    const prodVersionArn = Stack.of(this).formatArn({
      service: 'lambda',
      resource: 'function',
      resourceName: `${fn.functionName}:${prodVersionNumber.valueAsString}`,
    });

    const prodVersion = lambda.Version.fromVersionArn(this, 'ProdVersionImported', prodVersionArn);

    const prodAlias = new lambda.Alias(this, 'ProdAlias', {
      aliasName: 'prod',
      version: prodVersion,
    });

    const canaryAlias = new lambda.Alias(this, 'CanaryAlias', {
      aliasName: 'canary',
      version: publishedVersion, // always points to the newest version each deploy
    });

    // ========= 4) API Gateway (low-level) with stage variables for alias switching =========
    const api = new apigw.CfnRestApi(this, 'Api', {
      name: 'canary-api',
      endpointConfiguration: { types: ['REGIONAL'] },
    });

    // /hello
    const hello = new apigw.CfnResource(this, 'HelloResource', {
      restApiId: api.ref,
      parentId: api.attrRootResourceId,
      pathPart: 'hello',
    });

    // Integration URI uses stage variable to choose alias (prod/canary)
    // IMPORTANT: escape ${...} so CFN leaves it literal for API GW to resolve at runtime
    const integrationUri =
      `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/` +
      `arn:aws:lambda:${this.region}:${this.account}:function:${fn.functionName}:` +
      `\\\${stageVariables.lambdaAlias}/invocations`;

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

    const deployment = new apigw.CfnDeployment(this, 'Deployment', {
      restApiId: api.ref,
      description: 'Deploy after method exists',
    });
    // Ensure API has methods before creating a deployment (fixes 400: no methods)
    deployment.addDependency(method);

    // Stage with 90/10 split using stage variables (prod base, canary override)
    const stage = new apigw.CfnStage(this, 'ProdStage', {
      stageName: 'prod',
      restApiId: api.ref,
      deploymentId: deployment.ref,
      variables: { lambdaAlias: 'prod' }, // base
      canarySetting: {
        percentTraffic: 0.1, // 10% to canary
        stageVariableOverrides: { lambdaAlias: 'canary' },
        useStageCache: false,
      },
    });

    // ========= 5) Permissions: API GW must invoke both aliases =========
    const executeApiArn = `arn:aws:execute-api:${this.region}:${this.account}:${api.ref}/*/*/hello`;

    prodAlias.addPermission('InvokeByApiGWProd', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: executeApiArn,
    });

    canaryAlias.addPermission('InvokeByApiGWCanary', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: executeApiArn,
    });

    new CfnOutput(this, 'InvokeUrl', {
      value: `https://${api.ref}.execute-api.${this.region}.amazonaws.com/${stage.stageName}/hello`,
    });
  }
}
