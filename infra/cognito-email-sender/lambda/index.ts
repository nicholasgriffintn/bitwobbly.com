import {
  KmsKeyringNode,
  buildClient,
  CommitmentPolicy,
} from "@aws-crypto/client-node";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);

const generatorKeyId = process.env.KEY_ID!;
const keyIds = [process.env.KEY_ARN!];
const keyring = new KmsKeyringNode({ generatorKeyId, keyIds });

const RESEND_API_KEY_PARAM = process.env.RESEND_API_KEY_PARAM!;
const FROM_EMAIL = process.env.FROM_EMAIL!;
const APP_URL = process.env.APP_URL!;

const ssmClient = new SSMClient({});
let cachedApiKey: string | null = null;

async function getResendApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: RESEND_API_KEY_PARAM,
      WithDecryption: true,
    }),
  );

  cachedApiKey = response.Parameter?.Value ?? "";
  return cachedApiKey;
}

interface CognitoEvent {
  triggerSource: string;
  request: {
    type: string;
    code?: string;
    clientMetadata?: Record<string, string>;
    userAttributes: Record<string, string>;
  };
}

type EmailType =
  | "verification"
  | "forgot_password"
  | "admin_create"
  | "mfa_code"
  | "account_takeover";

function getEmailTemplate(
  type: EmailType,
  code: string,
  userAttributes: Record<string, string>,
): { subject: string; html: string } {
  const name = userAttributes.name || userAttributes.given_name || "";

  const baseStyles = `
    font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #111111;
  `;

  const wrapperStyles = `
    max-width: 600px;
    margin: 0 auto;
    padding: 40px 20px;
    background: linear-gradient(180deg, #ffffff 0%, #f6efe7 45%, #ecdcc9 100%);
  `;

  const cardStyles = `
    background: #ffffff;
    border: 1px solid #d2c6ba;
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(18, 10, 6, 0.12);
  `;

  const brandStyles = `
    text-align: center;
    margin-bottom: 24px;
  `;

  const brandDotStyles = `
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #f04a2f;
    box-shadow: 0 0 0 4px rgba(240, 74, 47, 0.15);
    margin-right: 8px;
  `;

  const brandTitleStyles = `
    font-family: 'Space Grotesk', sans-serif;
    font-size: 24px;
    font-weight: 600;
    color: #111111;
    margin: 0;
    display: inline;
    vertical-align: middle;
  `;

  const headingStyles = `
    font-family: 'Space Grotesk', sans-serif;
    font-size: 28px;
    font-weight: 600;
    color: #111111;
    margin: 0 0 16px 0;
  `;

  const textStyles = `
    color: #6f6255;
    font-size: 16px;
    margin: 0 0 24px 0;
  `;

  const codeBoxStyles = `
    background: #f3f0eb;
    border: 1px solid #d2c6ba;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    margin: 24px 0;
  `;

  const codeStyles = `
    font-family: 'Space Grotesk', monospace;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: 8px;
    color: #111111;
    margin: 0;
  `;

  const buttonStyles = `
    display: inline-block;
    background: #f04a2f;
    color: white;
    padding: 14px 28px;
    border-radius: 12px;
    text-decoration: none;
    font-weight: 600;
    font-size: 16px;
    box-shadow: 0 12px 20px rgba(240, 74, 47, 0.25);
  `;

  const footerStyles = `
    text-align: center;
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #d2c6ba;
    color: #6f6255;
    font-size: 14px;
  `;

  const warningStyles = `
    background: rgba(240, 74, 47, 0.08);
    border: 1px solid rgba(240, 74, 47, 0.3);
    border-radius: 12px;
    padding: 16px;
    color: #c43720;
    font-size: 14px;
    margin-top: 24px;
  `;

  const header = `
    <div style="${brandStyles}">
      <span style="${brandDotStyles}"></span>
      <span style="${brandTitleStyles}">BitWobbly</span>
    </div>
  `;

  const footer = `
    <div style="${footerStyles}">
      <p style="margin: 0;">This email was sent by <a href="${APP_URL}" style="color: #f04a2f; text-decoration: none;">BitWobbly</a></p>
      <p style="margin: 8px 0 0 0; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const templates: Record<EmailType, { subject: string; content: string }> = {
    verification: {
      subject: "Verify your email address",
      content: `
        <h1 style="${headingStyles}">Verify your email</h1>
        <p style="${textStyles}">
          ${name ? `Hey ${name}, thanks` : "Thanks"} for signing up for BitWobbly.
          Use the code below to verify your email address.
        </p>
        <div style="${codeBoxStyles}">
          <p style="${codeStyles}">${code}</p>
        </div>
        <p style="${textStyles}">
          This code expires in 24 hours. If you didn't create an account,
          you can ignore this email.
        </p>
      `,
    },
    forgot_password: {
      subject: "Reset your password",
      content: `
        <h1 style="${headingStyles}">Reset your password</h1>
        <p style="${textStyles}">
          We received a request to reset the password for your BitWobbly account.
          Use the code below to set a new password.
        </p>
        <div style="${codeBoxStyles}">
          <p style="${codeStyles}">${code}</p>
        </div>
        <p style="${textStyles}">
          This code expires in 1 hour. If you didn't request a password reset,
          you can ignore this email and your password will remain unchanged.
        </p>
      `,
    },
    admin_create: {
      subject: "Welcome to BitWobbly",
      content: `
        <h1 style="${headingStyles}">Welcome to BitWobbly</h1>
        <p style="${textStyles}">
          An account has been created for you at BitWobbly.
          Use the temporary password below to sign in.
        </p>
        <div style="${codeBoxStyles}">
          <p style="${codeStyles}">${code}</p>
        </div>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${APP_URL}/login" style="${buttonStyles}">Sign In</a>
        </p>
        <p style="${textStyles}">
          You'll be prompted to set a new password after signing in.
        </p>
      `,
    },
    mfa_code: {
      subject: "Your sign-in code",
      content: `
        <h1 style="${headingStyles}">Your sign-in code</h1>
        <p style="${textStyles}">
          Use this code to complete your sign-in to BitWobbly.
        </p>
        <div style="${codeBoxStyles}">
          <p style="${codeStyles}">${code}</p>
        </div>
        <p style="${textStyles}">
          This code expires in 5 minutes. If you didn't try to sign in,
          someone may be attempting to access your account.
        </p>
      `,
    },
    account_takeover: {
      subject: "Security alert: Unusual sign-in attempt",
      content: `
        <h1 style="${headingStyles}">Security Alert</h1>
        <div style="${warningStyles}">
          <strong>Unusual sign-in attempt detected</strong>
        </div>
        <p style="${textStyles}; margin-top: 24px;">
          We detected an unusual sign-in attempt to your BitWobbly account.
          If this wasn't you, we recommend changing your password immediately.
        </p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${APP_URL}/forgot-password" style="${buttonStyles}">Reset Password</a>
        </p>
        <p style="${textStyles}">
          If you recognise this activity, you can safely ignore this email.
        </p>
      `,
    },
  };

  const template = templates[type];

  return {
    subject: template.subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
          <title>${template.subject}</title>
        </head>
        <body style="${baseStyles}; margin: 0; padding: 0;">
          <div style="${wrapperStyles}">
            <div style="${cardStyles}">
              ${header}
              ${template.content}
              ${footer}
            </div>
          </div>
        </body>
      </html>
    `,
  };
}

function getEmailType(triggerSource: string): EmailType {
  switch (triggerSource) {
    case "CustomEmailSender_SignUp":
    case "CustomEmailSender_ResendCode":
    case "CustomEmailSender_UpdateUserAttribute":
    case "CustomEmailSender_VerifyUserAttribute":
      return "verification";
    case "CustomEmailSender_ForgotPassword":
      return "forgot_password";
    case "CustomEmailSender_AdminCreateUser":
      return "admin_create";
    case "CustomEmailSender_Authentication":
      return "mfa_code";
    case "CustomEmailSender_AccountTakeOverNotification":
      return "account_takeover";
    default:
      return "verification";
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = await getResendApiKey();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }
}

export async function handler(event: CognitoEvent): Promise<void> {
  try {
    let plainTextCode = "";

    if (event.request.code) {
      const { plaintext } = await decrypt(
        keyring,
        Buffer.from(event.request.code, "base64"),
      );
      plainTextCode = Buffer.from(plaintext).toString("utf-8");
    }

    const emailAddress = event.request.userAttributes.email;
    if (!emailAddress) {
      console.error("No email address found in user attributes");
      return;
    }

    const emailType = getEmailType(event.triggerSource);
    const { subject, html } = getEmailTemplate(
      emailType,
      plainTextCode,
      event.request.userAttributes,
    );

    await sendEmail(emailAddress, subject, html);

    console.log(`Email sent successfully for trigger: ${event.triggerSource}`);
  } catch (error) {
    console.error("Error in custom email sender:", error);
    throw error;
  }
}
