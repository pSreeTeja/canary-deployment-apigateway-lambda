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
        DEPLOYMENT_TICK: new Date().toISOString(), // forces version change each deploy
      },
    });

    // 2) Publish a new version for canary
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
      version: canaryVersion, // subsequent deploys: will point to new version
    });

    // 4) API Gateway
    const api = new apigw.RestApi(this, "RestApi", {
      restApiName: "canary-api",
      deployOptions: {
        stageName: "prod",
        variables: {
          lambdaAlias: "prod",
        },
      },
    });

    const hello = api.root.addResource("hello");

    hello.addMethod(
      "ANY",
      new apigw.LambdaIntegration(fn, { proxy: true })
    );

    // 5) Permissions
    prodAlias.addPermission("ApiGWInvokeProd", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/*/hello`,
    });

    canaryAlias.addPermission("ApiGWInvokeCanary", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/*/hello`,
    });

    new CfnOutput(this, "InvokeUrl", {
      value: api.url,
    });
  }
}
