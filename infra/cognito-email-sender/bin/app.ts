#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { CognitoEmailSenderStack } from "../lib/cognito-email-sender-stack";

const app = new cdk.App();

new CognitoEmailSenderStack(app, "CognitoEmailSenderStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
