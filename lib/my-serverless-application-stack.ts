import {
  Stack,
  StackProps,
  CfnOutput,
  Aws,
  Fn,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

export class MyServerlessApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Lambda function
    const lambdaFn = new lambda.Function(this, "MyFunction", {
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
    });

    // Function version (latest code snapshot)
    const version = lambdaFn.currentVersion;

    // Prod alias
    const alias = new lambda.Alias(this, "LambdaAlias", {
      aliasName: "Prod",
      version,
    });

    // API Gateway Rest API
    const restApi = new apigateway.RestApi(this, "RestApi", {
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deploy: false,
      retainDeployments: false,
    });

    // Initial deployment
    const deployment = new apigateway.Deployment(this, "Deployment", {
      api: restApi,
      retainDeployments: false,
    });

    // Stage with stage variable pointing to Prod alias
    const stage = new apigateway.Stage(this, "ProdStage", {
      deployment,
      variables: {
        lambdaAlias: "Prod",
      },
    });
    restApi.deploymentStage = stage;

    // Integration URI using stage variable
    const stageUri = `arn:aws:apigateway:${Aws.REGION}:lambda:path/2015-03-31/functions/${lambdaFn.functionArn}:\${stageVariables.lambdaAlias}/invocations`;

    const integration = new apigateway.Integration({
      type: apigateway.IntegrationType.AWS_PROXY,
      integrationHttpMethod: "POST",
      uri: stageUri,
    });

    // Add GET method
    const method = restApi.root.addMethod("GET", integration);

    // Permissions for Lambda + alias
    lambdaFn.addPermission("LambdaPermission", {
      action: "lambda:InvokeFunction",
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: method.methodArn.replace(restApi.deploymentStage.stageName, "*"),
    });

    alias.addPermission("AliasPermission", {
      action: "lambda:InvokeFunction",
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: method.methodArn.replace(restApi.deploymentStage.stageName, "*"),
    });

    // Outputs
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
