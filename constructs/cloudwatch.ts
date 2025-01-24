import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
// import { PIPELINE_NAME } from "../configuration";

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

        const snsDeployFailedTopic = new sns.Topic(this, `DeployFailedTopic`, {
            displayName: `DeployFailedSTopic`
        });

        // Define Slack channel configuration
        new chatbot.SlackChannelConfiguration(this, "SlackChannelConfig", {
            slackChannelConfigurationName: "MySlackConfig",
            slackWorkspaceId: props.slackWorkspaceId,
            slackChannelId: props.slackChannelId,
            notificationTopics: [snsBuildFailedTopic, snsDeployFailedTopic]
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

        

        // TODO: add slack endpoint
        // new cloudwatch.Alarm(this, `DeployFailedAlarm`, {
        //     alarmName: `Deploy-Alarm`,
        //     metric: new cloudwatch.Metric({
        //         namespace: "AWS/CodePipeline",
        //         metricName: "ActionExecution",
        //         // dimensionsMap: {
        //         //     PipelineName: `${PIPELINE_NAME}`,
        //         //     StageName: "Deploy",
        //         //     ActionName: deployAction.actionProperties.actionName
        //         // },
        //         statistic: "Sum",
        //         period: Duration.minutes(1)
        //     }),
        //     threshold: 1, // Example threshold for failure
        //     evaluationPeriods: 1,
        //     comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
        // }).addAlarmAction(new cloudwatch_actions.SnsAction(snsDeployFailedTopic));
    }
}
