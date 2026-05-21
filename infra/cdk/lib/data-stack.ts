import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  SecretValue,
  Stack,
  type StackProps
} from 'aws-cdk-lib'
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  type SecurityGroup,
  SubnetType,
  type Vpc
} from 'aws-cdk-lib/aws-ec2'
import { Repository, TagStatus } from 'aws-cdk-lib/aws-ecr'
import {
  Cluster,
  ContainerImage,
  Secret as EcsSecret,
  FargateTaskDefinition,
  LogDrivers
} from 'aws-cdk-lib/aws-ecs'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  StorageType
} from 'aws-cdk-lib/aws-rds'
import { Secret } from 'aws-cdk-lib/aws-secretsmanager'
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses'
import type { Construct } from 'constructs'
import { type EnvName, PRODUCT } from './config.js'

export interface DataStackProps extends StackProps {
  envName: EnvName
  vpc: Vpc
  rdsSg: SecurityGroup
  imageTag: string
  // Per-env From address (e.g. "noreply@staging.example.com"). When set,
  // the stack provisions an SES domain identity for the address's domain
  // and outputs the DKIM tokens for the operator to add to DNS. Empty
  // means the mailer is unconfigured — `sendResetPassword` logs and skips
  // (mirrors the Stripe pattern).
  mailFrom?: string
}

type DbSecrets = {
  DB_HOST: EcsSecret
  DB_PORT: EcsSecret
  DB_USER: EcsSecret
  DB_PASSWORD: EcsSecret
  DB_NAME: EcsSecret
}

type AppSecrets = {
  BETTER_AUTH_SECRET: EcsSecret
  STRIPE_API_KEY: EcsSecret
  STRIPE_WEBHOOK_SECRET: EcsSecret
}

const DB_NAME = 'app'
const DB_USER = 'template_admin'

export class DataStack extends Stack {
  readonly apiRepo: Repository
  readonly cluster: Cluster
  readonly database: DatabaseInstance
  readonly dbSecrets: DbSecrets
  readonly appSecrets: AppSecrets
  readonly sesIdentity?: EmailIdentity

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)

    const { envName, vpc, rdsSg, imageTag, mailFrom } = props

    const isProd = envName === 'production'

    const ecrLifecycleRules = [
      {
        rulePriority: 1,
        description: 'Keep only the last 30 tagged images',
        tagStatus: TagStatus.TAGGED,
        tagPatternList: ['*'],
        maxImageCount: 30
      },
      {
        rulePriority: 2,
        description: 'Expire untagged images after 1 day',
        tagStatus: TagStatus.UNTAGGED,
        maxImageAge: Duration.days(1)
      }
    ]

    this.apiRepo = new Repository(this, 'ApiRepo', {
      repositoryName: `${PRODUCT}-${envName}-api`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: ecrLifecycleRules
    })

    this.database = new DatabaseInstance(this, 'Postgres', {
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_18_3
      }),
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSg],
      databaseName: DB_NAME,
      credentials: Credentials.fromGeneratedSecret(DB_USER, {
        secretName: `${PRODUCT}-${envName}-db-credentials`
      }),
      allocatedStorage: 20,
      storageType: StorageType.GP3,
      // Prod runs multi-AZ for failover; staging stays single-AZ to save cost.
      multiAz: isProd,
      publiclyAccessible: false,
      storageEncrypted: true,
      autoMinorVersionUpgrade: true,
      backupRetention: Duration.days(7),
      deleteAutomatedBackups: true,
      // Guard the production database against accidental deletion: a
      // `cdk destroy` or a stack replacement must not silently drop the
      // prod DB. Staging stays disposable so it can be torn down freely.
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY
    })

    this.cluster = new Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${PRODUCT}-${envName}`,
      containerInsightsV2: undefined
    })

    const dbSecret = this.database.secret

    if (!dbSecret) {
      throw new Error(
        'RDS instance has no secret; Credentials.fromGeneratedSecret should have created one'
      )
    }

    this.dbSecrets = {
      DB_HOST: EcsSecret.fromSecretsManager(dbSecret, 'host'),
      DB_PORT: EcsSecret.fromSecretsManager(dbSecret, 'port'),
      DB_USER: EcsSecret.fromSecretsManager(dbSecret, 'username'),
      DB_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, 'password'),
      DB_NAME: EcsSecret.fromSecretsManager(dbSecret, 'dbname')
    }

    const appSecretsRaw = new Secret(this, 'AppSecrets', {
      secretName: `${PRODUCT}-${envName}-app-secrets`,
      description: 'App-level secrets (better-auth signing key, future app secrets)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'betterAuthSecret',
        passwordLength: 64,
        excludePunctuation: true
      }
    })

    // Stripe secrets — populated out-of-band by the operator after stack
    // creation. Empty defaults keep the keys present in the JSON document
    // so isBillingConfigured() returns a clear 503 until they're set.
    const stripeSecretsRaw = new Secret(this, 'StripeSecrets', {
      secretName: `${PRODUCT}-${envName}-stripe-secrets`,
      description: 'Stripe API key + webhook signing secret (fork-supplied)',
      secretObjectValue: {
        apiKey: SecretValue.unsafePlainText(''),
        webhookSecret: SecretValue.unsafePlainText('')
      }
    })

    this.appSecrets = {
      BETTER_AUTH_SECRET: EcsSecret.fromSecretsManager(appSecretsRaw, 'betterAuthSecret'),
      STRIPE_API_KEY: EcsSecret.fromSecretsManager(stripeSecretsRaw, 'apiKey'),
      STRIPE_WEBHOOK_SECRET: EcsSecret.fromSecretsManager(stripeSecretsRaw, 'webhookSecret')
    }

    const migratorLogGroup = new LogGroup(this, 'MigratorLogs', {
      logGroupName: `/ecs/${PRODUCT}-${envName}-migrator`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY
    })

    const migratorTaskDef = new FargateTaskDefinition(this, 'MigratorTask', {
      cpu: 256,
      memoryLimitMiB: 512,
      family: `${PRODUCT}-${envName}-migrator`
    })

    migratorTaskDef.addContainer('migrator', {
      image: ContainerImage.fromEcrRepository(this.apiRepo, imageTag),
      logging: LogDrivers.awsLogs({ logGroup: migratorLogGroup, streamPrefix: 'migrator' }),
      environment: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      secrets: this.dbSecrets,
      command: ['sh', '-c', 'cd packages/db && node_modules/.bin/prisma migrate deploy']
    })

    new CfnOutput(this, 'MigratorTaskDefArn', {
      value: migratorTaskDef.taskDefinitionArn,
      description: 'Task definition ARN for the prisma migrate one-off task'
    })
    new CfnOutput(this, 'ApiClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS cluster name (shared by the API service and the migrator)'
    })
    new CfnOutput(this, 'MigratorLogGroupName', {
      value: migratorLogGroup.logGroupName,
      description: 'Log group for the migrator task — tail this on failure'
    })

    // SES domain identity. Created only when a fork supplies a per-env
    // From address (`-c mailFrom.<env>=…`). Domain identities cover all
    // addresses on the domain (noreply@, billing@, etc.) so future email
    // types reuse this identity. The DKIM tokens are exposed as outputs
    // — the operator copies them as CNAME records into DNS to complete
    // verification. Until DNS is in place, SES sends will fail; the
    // mailer's try/catch in apps/api/src/lib/auth.ts logs and swallows
    // so the user-facing reset request still 200s.
    if (mailFrom) {
      const domain = mailFrom.split('@')[1]

      if (!domain) {
        throw new Error(
          `Invalid mailFrom for ${envName}: "${mailFrom}" — expected an email of the form name@domain`
        )
      }

      this.sesIdentity = new EmailIdentity(this, 'MailIdentity', {
        identity: Identity.domain(domain)
      })

      new CfnOutput(this, 'MailIdentityName', {
        value: this.sesIdentity.emailIdentityName,
        description: 'SES domain identity name (== the verified domain)'
      })
      new CfnOutput(this, 'MailDkimToken1', {
        value: `${this.sesIdentity.dkimDnsTokenName1} CNAME ${this.sesIdentity.dkimDnsTokenValue1}`,
        description: 'SES DKIM CNAME record #1 — add to DNS to complete verification'
      })
      new CfnOutput(this, 'MailDkimToken2', {
        value: `${this.sesIdentity.dkimDnsTokenName2} CNAME ${this.sesIdentity.dkimDnsTokenValue2}`,
        description: 'SES DKIM CNAME record #2 — add to DNS to complete verification'
      })
      new CfnOutput(this, 'MailDkimToken3', {
        value: `${this.sesIdentity.dkimDnsTokenName3} CNAME ${this.sesIdentity.dkimDnsTokenValue3}`,
        description: 'SES DKIM CNAME record #3 — add to DNS to complete verification'
      })
    }
  }
}
