import {
    Stack,
    StackProps,
    Fn,
    RemovalPolicy,
  } from "aws-cdk-lib";
  import { Construct } from "constructs";
  import * as apigateway from "aws-cdk-lib/aws-apigateway";
  import * as lambda from "aws-cdk-lib/aws-lambda";
  
  export class CanaryDeploymentStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
      super(scope, id, props);
  
      // Import values from previous stack
      const LAMBDA_ARN = Fn.importValue("MyLambdaFunction");
      const API_ID = Fn.importValue("MyAPIGWID");
      const METHOD_ARN = Fn.importValue("MyMethodArn");
      const STAGE_NAME = Fn.importValue("MyStageName");
  
      // Import Lambda function
      const lambdaFn = lambda.Function.fromFunctionArn(this, "LambdaFn", LAMBDA_ARN);
  
      // Create a new version
      const version = new lambda.CfnVersion(this, "LambdaVersion", {
        functionName: lambdaFn.functionName,
      });
      version.applyRemovalPolicy(RemovalPolicy.RETAIN);
  
      // Create Dev alias for new version
      const alias = new lambda.CfnAlias(this, "LambdaAliasDev", {
        functionName: lambdaFn.functionName,
        functionVersion: version.attrVersion,
        name: "Dev",
      });
  
      // Permission for API Gateway to invoke Dev alias
      new lambda.CfnPermission(this, "AliasPermission", {
        action: "lambda:InvokeFunction",
        functionName: alias.ref,
        principal: "apigateway.amazonaws.com",
        sourceArn: METHOD_ARN.replace(STAGE_NAME, "*"),
      });
  
      // Canary deployment (50% traffic)
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
  