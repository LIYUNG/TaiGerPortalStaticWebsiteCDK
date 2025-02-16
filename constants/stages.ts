import { AWS_ACCOUNT, STATIC_ASSETS_BUCKET_DEV, TENANT_ID_DEV } from "../configuration";
import { Region } from "./regions";

export enum Stage {
    BETA = "beta",
    PROD = "prod"
}

export const STAGES = [
    {
        stageName: Stage.BETA,
        env: { region: Region.IAD, account: AWS_ACCOUNT },
        staticAssetsBucketName: STATIC_ASSETS_BUCKET_DEV,
        isProd: false,
        tenantId: TENANT_ID_DEV
    }
    // {
    //     stageName: Stage.PROD,
    //     env: { region: Region.NRT, account: AWS_ACCOUNT },
    //     staticAssetsBucketName: STATIC_ASSETS_BUCKET_PROD,
    //     isProd: true,
    //     tenantId: TENANT_ID_PRDO
    // }
];
