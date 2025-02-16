import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";

interface CognitoStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
}

export class CognitoStack extends cdk.Stack {
    public readonly userPool: cognito.UserPool;
    public readonly userPoolClient: cognito.UserPoolClient;

    constructor(scope: cdk.App, id: string, props: CognitoStackProps) {
        super(scope, id, props);

        // Create Cognito User Pool
        this.userPool = new cognito.UserPool(this, `UserPool-${props.stageName}`, {
            selfSignUpEnabled: true,
            userVerification: { emailStyle: cognito.VerificationEmailStyle.LINK },
            signInAliases: { email: true },
            autoVerify: { email: true },
            removalPolicy: cdk.RemovalPolicy.DESTROY // Prod: retain
        });

        // Create App Client for authentication
        this.userPoolClient = new cognito.UserPoolClient(
            this,
            `UserPoolClient-${props.stageName}`,
            {
                userPool: this.userPool,
                authFlows: { userPassword: true },
                oAuth: {
                    callbackUrls: [`https://${props.domain}`], // CloudFront URL after login
                    logoutUrls: [`https://${props.domain}/logout`]
                }
            }
        );

        // Create Cognito Domain (Hosted UI)
        this.userPool.addDomain(`CognitoDomain-${props.stageName}`, {
            cognitoDomain: { domainPrefix: `${props.stageName}-taiger` }
        });

        // Output User Pool details
        new cdk.CfnOutput(this, `UserPoolId-${props.stageName}`, {
            value: this.userPool.userPoolId
        });
        new cdk.CfnOutput(this, `UserPoolClientId-${props.stageName}`, {
            value: this.userPoolClient.userPoolClientId
        });
        new cdk.CfnOutput(this, `CognitoHostedUI-${props.stageName}`, {
            value: `https://${props.stageName}-taiger.auth.${this.region}.amazoncognito.com/login`
        });
    }
}
