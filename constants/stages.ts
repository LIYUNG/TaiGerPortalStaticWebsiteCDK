import {
    AWS_ACCOUNT,
    STATIC_ASSETS_BUCKET_DEV,
    STATIC_ASSETS_BUCKET_PROD,
    TENANT_ID_DEV,
    TENANT_ID_PRDO
} from "../configuration";
import { Region } from "./regions";

export enum Stage {
    BETA = "beta",
    PROD = "prod"
}

export const STAGES = [
    {
        stageName: Stage.BETA,
        env: { region: Region.US_EAST_1, account: AWS_ACCOUNT },
        apiOriginRegion: Region.US_EAST_1,
        staticAssetsBucketName: STATIC_ASSETS_BUCKET_DEV,
        isProd: false,
        tenantId: TENANT_ID_DEV,
        REACT_APP_GOOGLE_CLIENT_ID:
            "867322734152-0agpur3trvqr4s5rrpbp2j6hallrd2d1.apps.googleusercontent.com",
        REACT_APP_GOOGLE_REDIRECT_URL:
            "https://beta.taigerconsultancy-portal.com/account/google/verify"
    },
    {
        stageName: Stage.PROD,
        env: { region: Region.US_WEST_2, account: AWS_ACCOUNT },
        apiOriginRegion: Region.US_WEST_2,
        staticAssetsBucketName: STATIC_ASSETS_BUCKET_PROD,
        isProd: true,
        tenantId: TENANT_ID_PRDO,
        REACT_APP_GOOGLE_CLIENT_ID:
            "867322734152-1u991odgfgvskcgpjfo1r1vdfcon119p.apps.googleusercontent.com",
        REACT_APP_GOOGLE_REDIRECT_URL: "https://taigerconsultancy-portal.com/account/google/verify"
    }
];
