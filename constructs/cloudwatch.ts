import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";

interface ChatbotCloudWatchIntegrationProps {
    slackChannelConfigurationName: string;
    slackWorkspaceId: string;
    slackChannelId: string;
    alarmName: string;
    metric: cloudwatch.Metric;
}

export class ChatbotCloudWatchIntegration extends Construct {
    constructor(scope: Construct, id: string, props: ChatbotCloudWatchIntegrationProps) {
        super(scope, id);

        // Create SNS topic
        const snsBuildFailedTopic = new sns.Topic(this, "Topic", {
            displayName: "BuildFailedSTopic"
        });

        // Define Slack channel configuration
        new chatbot.SlackChannelConfiguration(this, "SlackChannelConfig", {
            slackChannelConfigurationName: "MySlackConfig",
            slackWorkspaceId: props.slackWorkspaceId,
            slackChannelId: props.slackChannelId,
            notificationTopics: [snsBuildFailedTopic]
        });

        new cloudwatch.Alarm(this, "BuildFailedAlarm", {
            alarmName: props.alarmName,
            metric: new cloudwatch.Metric({
                namespace: "AWS/CodeBuild",
                metricName: "FailedBuilds",
                statistic: "Sum",
                period: Duration.minutes(5)
            }),
            threshold: 1, // Example threshold for failure
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
        }).addAlarmAction(new cloudwatch_actions.SnsAction(snsBuildFailedTopic));
    }
}
