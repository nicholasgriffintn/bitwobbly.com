import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

const RESEND_API_KEY_PARAM = "/bitwobbly/resend-api-key";

export interface CognitoEmailSenderStackProps extends cdk.StackProps {
  userPoolId?: string;
}

export class CognitoEmailSenderStack extends cdk.Stack {
  public readonly emailSenderFunction: lambda.IFunction;
  public readonly kmsKey: kms.IKey;

  constructor(
    scope: Construct,
    id: string,
    props?: CognitoEmailSenderStackProps,
  ) {
    super(scope, id, props);

    const userPoolId =
      props?.userPoolId ?? this.node.tryGetContext("userPoolId");

    this.kmsKey = new kms.Key(this, "EmailSenderKey", {
      description: "KMS key for Cognito custom email sender code encryption",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new kms.Alias(this, "EmailSenderKeyAlias", {
      aliasName: "alias/cognito-email-sender",
      targetKey: this.kmsKey,
    });

    this.emailSenderFunction = new nodejs.NodejsFunction(
      this,
      "EmailSenderFunction",
      {
        entry: path.join(__dirname, "../lambda/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: {
          KEY_ID: this.kmsKey.keyId,
          KEY_ARN: this.kmsKey.keyArn,
          RESEND_API_KEY_PARAM,
          FROM_EMAIL: "BitWobbly <bitwobbly@notifications.nicholasgriffin.dev>",
          APP_URL: "https://bitwobbly.com",
        },
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: [],
        },
      },
    );

    this.kmsKey.grantDecrypt(this.emailSenderFunction);

    (this.emailSenderFunction as nodejs.NodejsFunction).addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter${RESEND_API_KEY_PARAM}`,
        ],
      }),
    );

    this.kmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cognito-idp.amazonaws.com")],
        actions: ["kms:Encrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
        },
      }),
    );

    this.emailSenderFunction.addPermission("CognitoInvoke", {
      principal: new iam.ServicePrincipal("cognito-idp.amazonaws.com"),
      sourceArn: userPoolId
        ? `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`
        : `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
    });

    if (userPoolId) {
      const triggerConfigFn = this.createTriggerConfigFunction();

      this.kmsKey.grant(triggerConfigFn, "kms:CreateGrant", "kms:DescribeKey");

      new cdk.CustomResource(this, "CustomEmailSenderTrigger", {
        serviceToken: triggerConfigFn.functionArn,
        properties: {
          UserPoolId: userPoolId,
          LambdaArn: this.emailSenderFunction.functionArn,
          KmsKeyArn: this.kmsKey.keyArn,
        },
      });
    }

    new cdk.CfnOutput(this, "LambdaFunctionArn", {
      value: this.emailSenderFunction.functionArn,
      description: "ARN of the custom email sender Lambda function",
    });

    new cdk.CfnOutput(this, "KmsKeyArn", {
      value: this.kmsKey.keyArn,
      description: "ARN of the KMS key for code encryption",
    });
  }

  private createTriggerConfigFunction(): lambda.Function {
    const fn = new nodejs.NodejsFunction(this, "TriggerConfigFunction", {
      entry: path.join(__dirname, "../lambda/configure-trigger.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
    });

    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cognito-idp:UpdateUserPool", "cognito-idp:DescribeUserPool"],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
        ],
      }),
    );

    return fn;
  }
}
