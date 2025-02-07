import {
    API_BETA_DOMAINNAME,
    // API_PROD_DOMAIN,
    AWS_ACCOUNT,
    BETA_DOMAINNAME,
    // AWS_S3_BUCKET_DEV_FRONTEND,
    // AWS_S3_BUCKET_PROD_FRONTEND,
    STATIC_ASSETS_BUCKET_DEV,
    TENANT_ID_DEV
    // STATIC_ASSETS_BUCKET_PROD
} from "../configuration";
import { Region } from "./regions";

export enum Stage {
    Beta_FE = "Beta-FE",
    Prod_NA = "Prod-NA"
}

export const STAGES = [
    {
        stageName: Stage.Beta_FE,
        env: { region: Region.IAD, account: AWS_ACCOUNT },
        staticAssetsBucketName: STATIC_ASSETS_BUCKET_DEV,
        isProd: false,
        domain: BETA_DOMAINNAME,
        apiDomain: API_BETA_DOMAINNAME,
        tenantId: TENANT_ID_DEV
    }
    // {
    //     stageName: Stage.Prod_NA,
    //     env: { region: Region.NRT, account: AWS_ACCOUNT },
    //     staticAssetsBucketName: STATIC_ASSETS_BUCKET_PROD,
    //     isProd: true,
    //     domain: PROD_DOMAINNAME,
    //     apiDomain: API_PROD_DOMAINNAME,
    //     tenantId: TENANT_ID_PRDO
    // }
];
