import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class CanaryDepLambdaApigatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda function
    const lambdaFn = new lambda.Function(this, 'CanaryDemoLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('src'),
      description: 'Lambda for canary deployment demo',
    });

    // Lambda alias for deployment
    const lambdaAlias = new lambda.Alias(this, 'CanaryDemoLambdaAlias', {
      aliasName: 'Prod',
      version: lambdaFn.currentVersion,
    });

    // API Gateway REST API
    const api = new apigateway.RestApi(this, 'CanaryDemoApi', {
      restApiName: 'CanaryDemoApi',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
    });
    const rootIntegration = new apigateway.LambdaIntegration(lambdaAlias);
    api.root.addMethod('GET', rootIntegration);

    // CloudWatch alarm for Lambda errors
    const errorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: lambdaFn.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm for Lambda function errors',
      actionsEnabled: true,
    });

    // CodeDeploy canary deployment
    new codedeploy.LambdaDeploymentGroup(this, 'CanaryDeploymentGroup', {
      alias: lambdaAlias,
      deploymentConfig: codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
      alarms: [errorAlarm],
    });
  }
}
