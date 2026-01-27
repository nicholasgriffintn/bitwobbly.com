import {
  CognitoIdentityProviderClient,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

interface CloudFormationEvent {
  RequestType: "Create" | "Update" | "Delete";
  ResourceProperties: {
    UserPoolId: string;
    LambdaArn: string;
    KmsKeyArn: string;
  };
}

interface CloudFormationResponse {
  Status: "SUCCESS" | "FAILED";
  Reason?: string;
  PhysicalResourceId: string;
  Data?: Record<string, string>;
}

const client = new CognitoIdentityProviderClient({});

export async function handler(
  event: CloudFormationEvent,
): Promise<CloudFormationResponse> {
  const { UserPoolId, LambdaArn, KmsKeyArn } = event.ResourceProperties;
  const physicalResourceId = `custom-email-sender-${UserPoolId}`;

  try {
    if (event.RequestType === "Delete") {
      const describeResponse = await client.send(
        new DescribeUserPoolCommand({ UserPoolId }),
      );

      const userPool = describeResponse.UserPool;
      if (!userPool) {
        throw new Error("User pool not found");
      }

      await client.send(
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

      return {
        Status: "SUCCESS",
        PhysicalResourceId: physicalResourceId,
      };
    }

    const describeResponse = await client.send(
      new DescribeUserPoolCommand({ UserPoolId }),
    );

    const userPool = describeResponse.UserPool;
    if (!userPool) {
      throw new Error("User pool not found");
    }

    await client.send(
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

    return {
      Status: "SUCCESS",
      PhysicalResourceId: physicalResourceId,
      Data: {
        Message: "Custom email sender configured successfully",
      },
    };
  } catch (error) {
    console.error("Error configuring custom email sender:", error);
    return {
      Status: "FAILED",
      Reason: error instanceof Error ? error.message : "Unknown error",
      PhysicalResourceId: physicalResourceId,
    };
  }
}
