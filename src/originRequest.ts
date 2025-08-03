import { CloudFrontRequestEvent, CloudFrontRequest } from "aws-lambda";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import * as jwt from "jsonwebtoken";

const sigV4SignCloudFrontRequest = async (
    request: CloudFrontRequest
): Promise<CloudFrontRequest> => {
    const cloudfrontOrigin = request.origin?.custom?.domainName;
    console.log(`cloudfrontOrigin: ${cloudfrontOrigin}`);
    // 1. Extract and verify JWT from cookie
    console.log(`x-auth cookie: ${JSON.stringify(request.headers["cookie"])}`);

    // Extract x-auth cookie from the cookie header
    const cookieHeader = request.headers["cookie"]?.[0]?.value;
    if (!cookieHeader) {
        console.log(`Missing cookie header`);
        throw new Error("Missing cookie header in request");
    }

    // Parse cookies to find x-auth
    const cookies = cookieHeader
        .split(";")
        .reduce((acc: { [key: string]: string }, cookie: string) => {
            const [key, value] = cookie.trim().split("=");
            if (key && value) {
                acc[key] = value;
            }
            return acc;
        }, {});

    const authToken = cookies["x-auth"];
    if (!authToken) {
        console.log(`Missing x-auth cookie`);
        throw new Error("Missing x-auth cookie in request");
    }

    const token = authToken.replace(/^Bearer\s+/i, "");
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET!);
    if (!decodedToken) {
        throw new Error(`Invalid JWT token: ${token}`);
    }
    console.log(`before-signed request headers: ${JSON.stringify(request.headers)}`);
    const service = "execute-api";
    const region = process.env.AWS_REGION!;
    const canonicalURI = request.uri;

    // Handle query string properly
    let queryString = "";
    if (request.querystring) {
        queryString = request.querystring;
    }

    const signer = new SignatureV4({
        region: region,
        service: service,
        sha256: Sha256,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            sessionToken: process.env.AWS_SESSION_TOKEN!
        }
    });

    // 2. Prepare the request for signing
    // const service = process.env.SERVICE;
    let bodyBuffer: Buffer | undefined = undefined;
    let decodedBody: string | undefined = undefined;
    if (request.body && request.body.data) {
        const { data, encoding, inputTruncated } = request.body;
        // request.body.data is by default base64 encoded;
        if (inputTruncated) {
            throw new Error("TRUNCATED_BODY_ERROR_MSG");
        }

        bodyBuffer = Buffer.from(data, encoding as BufferEncoding);
        decodedBody = bodyBuffer.toString("utf8");
    }

    // Build the full path including query string
    const fullPath = queryString ? `${canonicalURI}?${queryString}` : canonicalURI;

    const signedRequest = await signer.sign({
        method: request.method,
        hostname: cloudfrontOrigin!,
        path: fullPath,
        protocol: "https:",
        headers: {
            host: cloudfrontOrigin!
        },
        body: decodedBody
    });

    // Object.assign(request.headers, signedRequest.headers);
    for (const [headerKey, headerValue] of Object.entries(signedRequest.headers)) {
        request.headers[headerKey.toLowerCase()] = [
            {
                key: headerKey,
                value: headerValue
            }
        ];
    }
    console.log(`signedRequest: ${JSON.stringify(signedRequest)}`);

    // Extract query string from signed request path if it exists
    const pathParts = signedRequest.path?.split("?");
    const signedQueryString = pathParts && pathParts.length > 1 ? pathParts[1] : "";
    console.log(`signedQueryString: ${signedQueryString}`);

    // Update the request querystring with the signed version
    if (signedQueryString) {
        request.querystring = signedQueryString;
    }

    console.log(`SigV4-signed request headers: ${JSON.stringify(request.headers)}`);

    console.log(`Returning SigV4-signed request to user: ${JSON.stringify(request)}`);

    return request;
};

export const handler = async (event: CloudFrontRequestEvent): Promise<CloudFrontRequest> => {
    try {
        const request: CloudFrontRequest = event.Records[0].cf.request;
        const uri: string = request.uri;

        // Handle crm-api requests by removing the /crm-api/ prefix
        if (uri.startsWith("/crm-api/")) {
            console.log(`Processing crm-api request: ${uri}`);
            // Remove the /crm-api/ prefix from the URI
            const newUri = uri.replace(/^\/crm-api\//, "/");
            request.uri = newUri;
            console.log(`Modified URI for crm-api request: ${newUri}`);
            return sigV4SignCloudFrontRequest(request);
        }

        const signingRegex: string = "^/(api)(/.*)?$";
        // console.log(`signingRegex: ${signingRegex}`);
        if (signingRegex && new RegExp(signingRegex).test(uri)) {
            // console.log("Returning a SigV4 signed version of the original request.");
            return sigV4SignCloudFrontRequest(request);
        }
        // Do not mutate requests for all other requests
        console.log("Returning the original, unaltered request.");

        return request;
    } catch (error: unknown) {
        const errorMessage = `ERROR: An error occurred in the origin Lambda@Edge function while processing the request: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        // throw error;
        const request: CloudFrontRequest = event.Records[0].cf.request;
        return request;
    }
};
