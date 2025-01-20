// Tenant
export const TENANT_NAME = "TaiGer";
export const TENANT_CDK_NAME = "TaiGerCDK";

// GitHub
export const GITHUB_TOKEN =
    "arn:aws:secretsmanager:us-east-1:669131042313:secret:beta/taigerportal-Hm1SLX";
export const GITHUB_REPO = "TaiGer_Portal";
export const GITHUB_CDK_REPO = "TaiGerPortalStaticWebsiteCDK";
export const GITHUB_OWNER = "LIYUNG";
export const GITHUB_PACKAGE_BRANCH = "main";

// AWS
//// Pipeline
export const PIPELINE_NAME = "TaiGerPortalFrontendPipeline";

export const AWS_ACCOUNT = "669131042313";
export const DOMAIN_NAME = "taigerconsultancy-portal.com";
// Beta
export const AWS_S3_BUCKET_DEV_FRONTEND = "arn:aws:s3:::taiger-file-storage-development-website";
export const STATIC_ASSETS_BUCKET_DEV = "taiger-development-static-website";
export const BETA_DOMAINNAME = `beta.${DOMAIN_NAME}`;
export const API_BETA_DOMAINNAME = `beta.api.${DOMAIN_NAME}`;
export const BETA_DOMAIN = `https://${BETA_DOMAINNAME}`;
export const API_BETA_DOMAIN = `https://${API_BETA_DOMAINNAME}`;
export const TENANT_ID_DEV = `TaiGer`;

// Prod
export const AWS_S3_BUCKET_PROD_FRONTEND = "arn:aws:s3:::taiger-file-storage-production-website";
export const STATIC_ASSETS_BUCKET_PROD = "taiger-production-static-website";
export const PROD_DOMAINNAME = `prod.${DOMAIN_NAME}`;
export const API_PROD_DOMAINNAME = `prod.api.${DOMAIN_NAME}`;
export const PROD_DOMAIN = `https://${PROD_DOMAINNAME}`;
export const API_PROD_DOMAIN = `https://${API_PROD_DOMAINNAME}`;
export const TENANT_ID_PRDO = `TaiGer_Prod`;

export const AWS_CODEPIPELINE_APPROVER_EMAIL = "taiger.leoc@gmail.com";
