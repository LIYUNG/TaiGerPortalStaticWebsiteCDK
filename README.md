# TaiGer Portal Front-End with AWS CDK TypeScript

This is package includes the infrastructure and CodePipeline for deploying TaiGer Portal React Front-End.

- CodePipeline
- Build/Deploy steps
- Cloudfront
    - Origin - S3 bucker (React Static Assets)
    - Origin - API Gateway (Custom Domain)
    - Origin Access Control (OAC)

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
