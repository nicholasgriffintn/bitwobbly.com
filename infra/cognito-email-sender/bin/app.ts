#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { BitWobblyCognitoEmailSenderStack } from '../lib/cognito-email-sender-stack';

const app = new cdk.App();

new BitWobblyCognitoEmailSenderStack(app, 'BitWobblyCognitoEmailSenderStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
