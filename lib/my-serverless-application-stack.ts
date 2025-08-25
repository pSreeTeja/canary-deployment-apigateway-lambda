import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_apigateway as apigw,
  aws_iam as iam,
  CfnOutput,
  Duration,
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
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        DEPLOYMENT_TICK: new Date().toISOString(),
      },
    });

    // 2) Publish new version for canary
    const canaryVersion = new lambda.Version(this, "CanaryVersion", {
      lambda: fn,
      description: `Deployed at ${new Date().toISOString()}`,
    });

    // 3) Aliases
    const prodAlias = new lambda.Alias(this, "ProdAlias", {
      aliasName: "prod",
      version: canaryVersion, // first deploy: prod = canary
    });

    const canaryAlias = new lambda.Alias(this, "CanaryAlias", {
      aliasName: "canary",
      version: canaryVersion,
    });

    // 4) API Gateway
    const api = new apigw.RestApi(this, "RestApi", {
      restApiName: "canary-api",
      deployOptions: {
        stageName: "prod",
        variables: {
          lambdaAlias: "prod", // default = stable
        },
      },
    });

    const hello = api.root.addResource("hello");

    // Integration URI using stage variable for alias
    const integrationUri = `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${this.region}:${this.account}:function:${fn.functionName}:\${stageVariables.lambdaAlias}/invocations`;

    const method = new apigw.CfnMethod(this, "HelloAnyMethod", {
      restApiId: api.restApiId,
      resourceId: (hello.node.defaultChild as apigw.CfnResource).ref,
      httpMethod: "ANY",
      authorizationType: "NONE",
      integration: {
        type: "AWS_PROXY",
        integrationHttpMethod: "POST",
        uri: integrationUri,
      },
    });

    const deployment = new apigw.CfnDeployment(this, "Deployment", {
      restApiId: api.restApiId,
    });
    deployment.addDependency(method);

    // 5) Stage with Canary traffic
    const stage = new apigw.CfnStage(this, "ProdStage", {
      stageName: "prod",
      restApiId: api.restApiId,
      deploymentId: deployment.ref,
      variables: {
        lambdaAlias: "prod",
      },
      canarySetting: {
        percentTraffic: 0.1, // 10% to canary
        stageVariableOverrides: {
          lambdaAlias: "canary",
        },
        useStageCache: false,
      },
    });

    // 6) Permissions for API Gateway
    [prodAlias, canaryAlias].forEach((alias) =>
      alias.addPermission(`InvokeByApiGW-${alias.aliasName}`, {
        principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
        action: "lambda:InvokeFunction",
        sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/*/hello`,
      })
    );

    new CfnOutput(this, "InvokeUrl", {
      value: `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/${stage.stageName}/hello`,
    });
  }
}
