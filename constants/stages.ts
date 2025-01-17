import {
    API_BETA_DOMAIN,
    API_PROD_DOMAIN,
    AWS_ACCOUNT,
    AWS_S3_BUCKET_DEV_FRONTEND,
    AWS_S3_BUCKET_PROD_FRONTEND
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
        bucketArn: AWS_S3_BUCKET_DEV_FRONTEND,
        isProd: false,
        apiDomain: API_BETA_DOMAIN
    },
    {
        stageName: Stage.Prod_NA,
        env: { region: Region.NRT, account: AWS_ACCOUNT },
        bucketArn: AWS_S3_BUCKET_PROD_FRONTEND,
        isProd: true,
        apiDomain: API_PROD_DOMAIN
    }
];
