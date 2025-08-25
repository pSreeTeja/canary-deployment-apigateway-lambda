import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_apigateway as apigw,
  Duration,
  aws_iam as iam,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";

export class MyServerlessApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1) Lambda function
    const fn = new lambda.Function(this, "HelloFn", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
      environment: {
        DEPLOYMENT_TIME: new Date().toISOString(), // forces new code hash
      },
    });
    

    // 2) Explicit new version each deploy
    const newVersion = new lambda.Version(this, `Version${Date.now()}`, {
      lambda: fn,
    });

    // 3) Stable alias - points to last *manually promoted* version
    const prodAlias = new lambda.Alias(this, "ProdAlias", {
      aliasName: "prod",
      version: fn.currentVersion, // start by pointing to currentVersion
    });

    // 4) Canary alias - always points to the *new version*
    const canaryAlias = new lambda.Alias(this, "CanaryAlias", {
      aliasName: "canary",
      version: newVersion,
    });

    // 5) API Gateway setup
    const api = new apigw.CfnRestApi(this, "Api", {
      name: "canary-api",
      endpointConfiguration: { types: ["REGIONAL"] },
    });

    const hello = new apigw.CfnResource(this, "HelloResource", {
      restApiId: api.ref,
      parentId: api.attrRootResourceId,
      pathPart: "hello",
    });

    // Integration URI uses stage variable to choose alias
    const integrationUri = `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${this.region}:${this.account}:function:${fn.functionName}:\${stageVariables.lambdaAlias}/invocations`;

    const method = new apigw.CfnMethod(this, "HelloAnyMethod", {
      restApiId: api.ref,
      resourceId: hello.ref,
      httpMethod: "ANY",
      authorizationType: "NONE",
      integration: {
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: integrationUri,
      },
    });

    const deployment = new apigw.CfnDeployment(this, "Deployment", {
      restApiId: api.ref,
    });
    deployment.addDependency(method);

    // Canary stage
    new apigw.CfnStage(this, "CanaryStage", {
      restApiId: api.ref,
      stageName: "canary",
      deploymentId: deployment.ref,
      variables: {
        lambdaAlias: "canary",
      },
      canarySetting: {
        percentTraffic: 0.1, // 10% traffic
        stageVariableOverrides: { lambdaAlias: "canary" },
        useStageCache: false,
      },
    });

    // Prod stage (no canary)
    new apigw.CfnStage(this, "ProdStage", {
      restApiId: api.ref,
      stageName: "prod",
      deploymentId: deployment.ref,
      variables: {
        lambdaAlias: "prod",
      },
    });

    // Grant API Gateway invoke permissions on both aliases
    fn.addPermission("AllowInvokeProd", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.ref}/*/*/hello`,
    });
  }
}
