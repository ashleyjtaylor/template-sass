import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginProtocolPolicy,
  OriginRequestPolicy,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront'
import { LoadBalancerV2Origin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'
import { type SecurityGroup, SubnetType, type Vpc } from 'aws-cdk-lib/aws-ec2'
import type { Repository } from 'aws-cdk-lib/aws-ecr'
import {
  type Cluster,
  ContainerImage,
  type Secret as EcsSecret,
  FargateService,
  FargateTaskDefinition,
  LogDrivers
} from 'aws-cdk-lib/aws-ecs'
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  Protocol,
  TargetType
} from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3'
import type { EmailIdentity } from 'aws-cdk-lib/aws-ses'
import type { Construct } from 'constructs'
import { type EnvName, PRODUCT } from './config.js'
import { APP_PORT } from './network-stack.js'

export interface AppStackProps extends StackProps {
  envName: EnvName
  vpc: Vpc
  albSg: SecurityGroup
  ecsSg: SecurityGroup
  apiRepo: Repository
  cluster: Cluster
  dbSecrets: Record<string, EcsSecret>
  appSecrets: Record<string, EcsSecret>
  imageTag: string
  // Stripe price id for the Pro plan — fork-supplied via context flag
  // `stripePriceIdPro.<env>`. Empty string until configured; the billing
  // module's `isBillingConfigured()` predicate gates real Stripe calls.
  stripePriceIdPro?: string
  // SES identity created by the data-stack when `-c mailFrom.<env>=…`
  // is set. When present together with `mailFrom`, the API task gets
  // MAIL_TRANSPORT=ses, MAIL_FROM=<address>, and an IAM grant to
  // ses:SendEmail scoped to this identity's ARN.
  sesIdentity?: EmailIdentity
  mailFrom?: string
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props)

    const {
      envName,
      vpc,
      albSg,
      ecsSg,
      apiRepo,
      cluster,
      dbSecrets,
      appSecrets,
      imageTag,
      stripePriceIdPro,
      sesIdentity,
      mailFrom
    } = props

    const logGroup = new LogGroup(this, 'ApiLogs', {
      logGroupName: `/ecs/${PRODUCT}-${envName}-api`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const alb = new ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: `${PRODUCT}-${envName}`
    })

    const webSpaBucket = new Bucket(this, 'WebSpaBucket', {
      bucketName: `${PRODUCT}-${envName}-web-spa`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1)
        }
      ]
    })

    // CloudFront fronts everything. Default behavior serves the SPA bundle
    // from S3; `/api/*` proxies to the ALB. Browser sees a single origin
    // so the SPA's session cookie travels same-origin to the API — no CORS,
    // no cross-domain cookie dance.
    const apiBehavior = {
      origin: new LoadBalancerV2Origin(alb, {
        protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
        httpPort: 80
      }),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER
    }

    const spaErrorResponses = [
      {
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.minutes(0)
      },
      {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.minutes(0)
      }
    ]

    const webDistribution = new Distribution(this, 'WebSpaDistribution', {
      comment: `${PRODUCT}-${envName} apps/web + api`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(webSpaBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED
      },
      additionalBehaviors: { '/api/*': apiBehavior },
      errorResponses: spaErrorResponses
    })

    const taskDef = new FargateTaskDefinition(this, 'ApiTask', {
      cpu: 256,
      memoryLimitMiB: 512
    })

    const container = taskDef.addContainer('api', {
      image: ContainerImage.fromEcrRepository(apiRepo, imageTag),
      logging: LogDrivers.awsLogs({ logGroup, streamPrefix: 'api' }),
      environment: {
        NODE_ENV: 'production',
        APP_ENV: envName,
        PORT: String(APP_PORT),
        BETTER_AUTH_URL: `https://${webDistribution.distributionDomainName}`,
        CORS_ORIGINS: `https://${webDistribution.distributionDomainName}`,
        WEB_BASE_URL: `https://${webDistribution.distributionDomainName}`,
        STRIPE_PORTAL_RETURN_URL: `https://${webDistribution.distributionDomainName}`,
        STRIPE_PRICE_ID_PRO: stripePriceIdPro ?? '',
        // Mailer — APP_ENV (already set above) selects the transport
        // (`local` → Mailpit, `staging`/`production` → SES). MAIL_FROM
        // empty means "mailer not configured": `isMailerConfigured()`
        // returns false and the better-auth `sendResetPassword` callback
        // logs and skips rather than crashing the request.
        MAIL_FROM: mailFrom ?? ''
      },
      secrets: { ...dbSecrets, ...appSecrets },
      stopTimeout: Duration.seconds(30),
      healthCheck: {
        command: [
          'CMD-SHELL',
          `node -e "fetch('http://localhost:${APP_PORT}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
        ],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(60)
      }
    })

    container.addPortMappings({ containerPort: APP_PORT })

    // Grant the API task role permission to send via SES on the verified
    // identity. Scoping to the identity ARN means a fork that adds more
    // identities later doesn't accidentally widen this principal's reach.
    if (sesIdentity) {
      sesIdentity.grantSendEmail(taskDef.taskRole)
    }

    const service = new FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      circuitBreaker: { rollback: true },
      assignPublicIp: false,
      securityGroups: [ecsSg],
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS }
    })

    const targetGroup = new ApplicationTargetGroup(this, 'ApiTargets', {
      vpc,
      port: APP_PORT,
      protocol: ApplicationProtocol.HTTP,
      targetType: TargetType.IP,
      targets: [service],
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: '/health',
        protocol: Protocol.HTTP,
        port: String(APP_PORT),
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200'
      }
    })

    alb.addListener('HttpListener', {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup]
    })

    new CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Public DNS name of the ALB (direct origin; canonical entry is CloudFront)'
    })
    new CfnOutput(this, 'WebSpaUrl', {
      value: `https://${webDistribution.distributionDomainName}`,
      description: 'CloudFront URL serving apps/web + proxied /api/*'
    })
    new CfnOutput(this, 'WebSpaBucketName', {
      value: webSpaBucket.bucketName,
      description: 'S3 bucket the CI deploy-web-spa job syncs the apps/web bundle into'
    })
    new CfnOutput(this, 'WebSpaDistributionId', {
      value: webDistribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidations on apps/web deploy'
    })
  }
}
