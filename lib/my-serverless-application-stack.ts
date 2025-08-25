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
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        DEPLOYMENT_TICK: new Date().toISOString(), // forces new version each deploy
      },
    });

    // 2) Publish new version (canary target)
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

    // 4) API Gateway (high-level)
    const api = new apigw.RestApi(this, "RestApi", {
      restApiName: "canary-api",
    });

    const hello = api.root.addResource("hello");

    hello.addMethod(
      "ANY",
      new apigw.LambdaIntegration(fn, { proxy: true })
    );

    // 5) Deployment (low-level CfnDeployment)
    const deployment = new apigw.CfnDeployment(this, "Deployment", {
      restApiId: api.restApiId,
    });
    deployment.addDependency(hello.node.defaultChild as apigw.CfnResource);

    // 6) Stage with canary settings (low-level CfnStage)
    const stage = new apigw.CfnStage(this, "ProdStage", {
      stageName: "prod",
      restApiId: api.restApiId,
      deploymentId: deployment.ref,
      variables: { lambdaAlias: "prod" }, // default traffic -> prod alias
      canarySetting: {
        percentTraffic: 0.1, // 10% canary traffic
        stageVariableOverrides: { lambdaAlias: "canary" },
        useStageCache: false,
      },
    });

    // 7) Permissions for API Gateway
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
