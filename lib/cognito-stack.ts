import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { FederatedPrincipal, Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface CognitoStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
}

export class CognitoStack extends cdk.Stack {
    public readonly userPool: cognito.UserPool;
    public readonly identityPool: cognito.CfnIdentityPool;
    public readonly userPoolClient: cognito.UserPoolClient;

    constructor(scope: Construct, id: string, props: CognitoStackProps) {
        super(scope, id, props);

        // Create Cognito User Pool
        this.userPool = new cognito.UserPool(this, `UserPool-${props.stageName}`, {
            selfSignUpEnabled: false,
            autoVerify: { email: true },
            signInAliases: { email: true }
            // userVerification: { emailStyle: cognito.VerificationEmailStyle.LINK },
            // removalPolicy: cdk.RemovalPolicy.DESTROY // Prod: retain
        });

        // Create App Client for authentication
        this.userPoolClient = new cognito.UserPoolClient(
            this,
            `UserPoolClient-${props.stageName}`,
            {
                userPool: this.userPool,
                generateSecret: false // Don't need to generate secret for webapp running on browers
            }
        );

        this.identityPool = new cognito.CfnIdentityPool(this, `IdentityPool-${props.stageName}`, {
            allowUnauthenticatedIdentities: true,
            cognitoIdentityProviders: [
                {
                    clientId: this.userPoolClient.userPoolClientId,
                    providerName: this.userPool.userPoolProviderName
                }
            ]
        });

        const isUserCognitoGroupRole = new Role(this, `UserCognitoGroupRole-${props.stageName}`, {
            description: "Default role for authenticated users",
            assumedBy: new FederatedPrincipal(
                "cognito-identity.amazonaws.com",
                {
                    StringEquals: {
                        "cognito-identity.amazonaws.com:aud": this.identityPool.ref
                    },
                    "ForAnyValue:StringLike": {
                        "cognito-identity.amazonaws.com:amr": "authenticated"
                    }
                },
                "sts:AssumeRoleWithWebIdentity"
            )
        });

        new cognito.CfnIdentityPoolRoleAttachment(
            this,
            `IdentityPoolRoleAttachment-${props.stageName}`,
            {
                identityPoolId: this.identityPool.ref,
                roles: {
                    authenticated: isUserCognitoGroupRole.roleArn,
                    unauthenticated: isUserCognitoGroupRole.roleArn
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
