import {
  Stack,
  StackProps,
  Duration,
  aws_cloudwatch as cloudwatch,
  aws_logs as logs,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as codedeploy from "aws-cdk-lib/aws-codedeploy";
import * as path from "path";

export class CanaryDepLambdaApigatewayStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 1) Python Lambda Function
    const fn = new lambda.Function(this, "HelloFn", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../src")),
      handler: "handler.main",
      runtime: lambda.Runtime.PYTHON_3_12,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: {
        STAGE: "prod",
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // 2) Explicit Version resource (forces a new version every deploy)
    const version = new lambda.Version(this, "HelloFnVersion", {
      lambda: fn,
    });

    // 3) Alias points to the current version
    const alias = new lambda.Alias(this, "LiveAlias", {
      aliasName: "live",
      version,
    });

    // 4) Alarm on errors
    const errorAlarm = new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
      metric: alias.metricErrors({
        period: Duration.minutes(1),
        statistic: "sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription:
        "Alarm if the live alias sees any errors during canary.",
    });

    // 5) CodeDeploy Deployment Group for Canary Rollout
    new codedeploy.LambdaDeploymentGroup(this, "CanaryDG", {
      alias,
      deploymentConfig:
        codedeploy.LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
      alarms: [errorAlarm],
      autoRollback: {
        failedDeployment: true,
        stoppedDeployment: true,
        deploymentInAlarm: true,
      },
    });

    // 6) API Gateway integrated with the Lambda Alias
    const api = new apigw.RestApi(this, "HelloApi", {
      restApiName: "Hello Canary API",
      deployOptions: {
        stageName: "prod",
      },
    });

    const integration = new apigw.LambdaIntegration(alias);

    api.root.addResource("hello").addMethod("GET", integration);
  }
}
