import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

interface CloudFormationEvent {
  RequestType: "Create" | "Update" | "Delete";
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties: {
    ServiceToken: string;
    UserPoolId: string;
    LambdaArn: string;
    KmsKeyArn: string;
  };
}

interface CloudFormationResponse {
  Status: "SUCCESS" | "FAILED";
  Reason?: string;
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Data?: Record<string, string>;
}

const cognitoClient = new CognitoIdentityProviderClient({});

async function sendResponse(
  event: CloudFormationEvent,
  status: "SUCCESS" | "FAILED",
  reason?: string,
  data?: Record<string, string>,
): Promise<void> {
  const physicalResourceId =
    event.PhysicalResourceId ??
    `custom-email-sender-${event.ResourceProperties.UserPoolId}`;

  const response: CloudFormationResponse = {
    Status: status,
    Reason: reason ?? "See CloudWatch logs for details",
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  };

  const body = JSON.stringify(response);

  await fetch(event.ResponseURL, {
    method: "PUT",
    headers: {
      "Content-Type": "",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
  });
}

export async function handler(event: CloudFormationEvent): Promise<void> {
  console.log("Event:", JSON.stringify(event, null, 2));

  const { UserPoolId, LambdaArn, KmsKeyArn } = event.ResourceProperties;

  try {
    if (event.RequestType === "Delete") {
      const describeResponse = await cognitoClient.send(
        new DescribeUserPoolCommand({ UserPoolId }),
      );

      const userPool = describeResponse.UserPool;
      if (!userPool) {
        throw new Error("User pool not found");
      }

      await cognitoClient.send(
        new UpdateUserPoolCommand({
          UserPoolId,
          Policies: userPool.Policies,
          AutoVerifiedAttributes: userPool.AutoVerifiedAttributes,
          MfaConfiguration: userPool.MfaConfiguration,
          LambdaConfig: {
            ...userPool.LambdaConfig,
            CustomEmailSender: undefined,
            KMSKeyID: undefined,
          },
        }),
      );

      await sendResponse(event, "SUCCESS");
      return;
    }

    const describeResponse = await cognitoClient.send(
      new DescribeUserPoolCommand({ UserPoolId }),
    );

    const userPool = describeResponse.UserPool;
    if (!userPool) {
      throw new Error("User pool not found");
    }

    await cognitoClient.send(
      new UpdateUserPoolCommand({
        UserPoolId,
        Policies: userPool.Policies,
        AutoVerifiedAttributes: userPool.AutoVerifiedAttributes,
        MfaConfiguration: userPool.MfaConfiguration,
        LambdaConfig: {
          ...userPool.LambdaConfig,
          CustomEmailSender: {
            LambdaVersion: "V1_0",
            LambdaArn,
          },
          KMSKeyID: KmsKeyArn,
        },
      }),
    );

    await sendResponse(event, "SUCCESS", undefined, {
      Message: "Custom email sender configured successfully",
    });
  } catch (error) {
    console.error("Error configuring custom email sender:", error);
    await sendResponse(
      event,
      "FAILED",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
