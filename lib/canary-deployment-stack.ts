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

export class CanaryDeploymentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
      super(scope, id, props);
  
      const LAMBDA_ARN = Fn.importValue("MyLambdaFunction");
      const API_ID = Fn.importValue("MyAPIGWID");
      const METHOD_ARN = Fn.importValue("MyMethodArn");
      const STAGE_NAME = Fn.importValue("MyStageName");
  
      // Import Lambda function
      const lambdaFn = lambda_.Function.fromFunctionArn(
        this,
        "lambda_fn",
        LAMBDA_ARN
      );
  
      // Create new Lambda version
      const version = new lambda_.CfnVersion(this, "lambdaVersion", {
        functionName: lambdaFn.functionName,
      });
      version.applyRemovalPolicy(RemovalPolicy.RETAIN);
  
      // Create Dev alias
      const alias = new lambda_.CfnAlias(this, "lambdaAlias", {
        functionName: lambdaFn.functionName,
        functionVersion: version.attrVersion,
        name: "Dev",
      });
  
      // Add permission for Dev alias
      new lambda_.CfnPermission(this, "aliasPermission", {
        action: "lambda:InvokeFunction",
        functionName: alias.ref,
        principal: "apigateway.amazonaws.com",
        sourceArn: METHOD_ARN.replace(STAGE_NAME, "*"),
      });
  
      // Create Canary Deployment
      new apigateway.CfnDeployment(this, "CanaryDeployment", {
        restApiId: API_ID,
        deploymentCanarySettings: {
          percentTraffic: 50,
          stageVariableOverrides: {
            lambdaAlias: "Dev",
          },
        },
        stageName: "prod",
      });
    }
  }