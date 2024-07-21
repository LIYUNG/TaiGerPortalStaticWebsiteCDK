import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";

import { ChatbotCloudWatchIntegration } from "../constructs";

export class MySlackboteStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Define your integrated Chatbot and CloudWatch setup
        new ChatbotCloudWatchIntegration(this, "MyChatbotCloudWatchIntegration", {
            slackChannelConfigurationName: "taiger-dev-chatbot",
            slackWorkspaceId: "T074TTD76BG",
            slackChannelId: "C07CR6VPT8A",
            alarmName: "PipelineBuildFailure",
            metric: new cloudwatch.Metric({
                namespace: "AWS/CodeBuild",
                metricName: "FailedBuilds",
                statistic: "Sum",
                period: Duration.minutes(5)
            })
        });
    }
}
