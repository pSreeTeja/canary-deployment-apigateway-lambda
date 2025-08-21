import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  aws_lambda as lambda_,
  aws_apigateway as apigateway,
  aws_iam as iam,
  RemovalPolicy,
  CfnOutput,
  Fn,
  Aws,
} from "aws-cdk-lib";
import * as path from "path";


export class MyServerlessApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function
    const lambdaFn = new lambda_.Function(this, "MyFunction", {
      runtime: lambda_.Runtime.PYTHON_3_9,
      handler: "index.handler",
      code: lambda_.Code.fromAsset(path.join(__dirname, "../src")),
    });

    // Lambda Version
    const version = lambdaFn.currentVersion;

    // Create Lambda Alias (Prod)
    const alias = new lambda_.Alias(this, "LambdaAlias", {
      aliasName: "Prod",
      version: version,
    });

    // Create Rest API
    const restApi = new apigateway.RestApi(this, "RestApi", {
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deploy: false,
      retainDeployments: false,
    });

    // Create Deployment
    const deployment = new apigateway.Deployment(this, "Deployment", {
      api: restApi,
      retainDeployments: false,
    });

    // Create Prod Stage
    const stage = new apigateway.Stage(this, "prod", {
      deployment: deployment,
      variables: {
        lambdaAlias: "Prod",
      },
    });

    restApi.deploymentStage = stage;

    // Create URI for Lambda alias
    const stageUri = `arn:aws:apigateway:${Aws.REGION}:lambda:path/2015-03-31/functions/${lambdaFn.functionArn}:\${stageVariables.lambdaAlias}/invocations`;

    // Create Lambda Integration
    const integration = new apigateway.Integration({
      type: apigateway.IntegrationType.AWS_PROXY,
      integrationHttpMethod: "POST",
      uri: stageUri,
    });

    // API Gateway Method
    const method = restApi.root.addMethod("GET", integration);

    // Add Lambda permissions
    lambdaFn.addPermission("lambdaPermission", {
      action: "lambda:InvokeFunction",
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: method.methodArn.replace(
        restApi.deploymentStage.stageName,
        "*"
      ),
    });

    // Add permissions for Prod alias
    alias.addPermission("aliasPermission", {
      action: "lambda:InvokeFunction",
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: method.methodArn.replace(
        restApi.deploymentStage.stageName,
        "*"
      ),
    });

    // OUTPUTS
    new CfnOutput(this, "LambdaFunction", {
      exportName: "MyLambdaFunction",
      value: lambdaFn.functionArn,
    });
    new CfnOutput(this, "ApigwId", {
      exportName: "MyAPIGWID",
      value: restApi.restApiId,
    });
    new CfnOutput(this, "MethodArn", {
      exportName: "MyMethodArn",
      value: method.methodArn,
    });
    new CfnOutput(this, "StageName", {
      exportName: "MyStageName",
      value: restApi.deploymentStage.stageName,
    });
  }
}