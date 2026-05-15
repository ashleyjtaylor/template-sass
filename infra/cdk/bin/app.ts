import { App, type StackProps } from 'aws-cdk-lib'
import { AppStack } from '../lib/app-stack.js'
import { aws, type EnvName, PRODUCT, tagsFor } from '../lib/config.js'
import { DataStack } from '../lib/data-stack.js'
import { NetworkStack } from '../lib/network-stack.js'

const app = new App()

// Use `||` not `??` — an empty-string `imageTag` (e.g. from a workflow that
// failed to substitute it) must be treated as missing. `:placeholder` fails
// loudly with a clear error message.
const imageTag = app.node.tryGetContext('imageTag') || 'placeholder'

// Per-env Stripe Pro price id. Forks set via cdk.json or
// `-c stripePriceIdPro.staging=price_…`. Empty until configured — the
// billing module's `isBillingConfigured()` predicate returns a 503 from
// /api/billing/* in the meantime.
const stripePriceIdProFor = (env: EnvName): string | undefined => {
  const value = app.node.tryGetContext(`stripePriceIdPro.${env}`)

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// Per-env From address for outbound email (e.g. password reset). Forks
// set via cdk.json or `-c mailFrom.staging=noreply@staging.example.com`.
// When set, the data-stack provisions an SES `EmailIdentity` for the
// address's domain (DKIM tokens output as CFN outputs — operator copies
// them into DNS) and the app-stack injects MAIL_TRANSPORT=ses + MAIL_FROM
// into the container env plus grants ses:SendEmail to the task role.
// Empty until configured — the mailer module's `isMailerConfigured()`
// predicate causes the better-auth `sendResetPassword` callback to log
// and skip rather than crash the request.
const mailFromFor = (env: EnvName): string | undefined => {
  const value = app.node.tryGetContext(`mailFrom.${env}`)

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const envs: EnvName[] = ['staging', 'production']

for (const env of envs) {
  const baseProps: StackProps = {
    env: aws,
    tags: tagsFor(env),
    terminationProtection: false
  }

  const network = new NetworkStack(app, `${PRODUCT}-${env}-network`, baseProps)

  const mailFrom = mailFromFor(env)

  const data = new DataStack(app, `${PRODUCT}-${env}-data`, {
    ...baseProps,
    envName: env,
    vpc: network.vpc,
    rdsSg: network.rdsSg,
    imageTag,
    ...(mailFrom !== undefined && { mailFrom })
  })

  new AppStack(app, `${PRODUCT}-${env}-app`, {
    ...baseProps,
    envName: env,
    vpc: network.vpc,
    albSg: network.albSg,
    ecsSg: network.ecsSg,
    apiRepo: data.apiRepo,
    cluster: data.cluster,
    dbSecrets: data.dbSecrets,
    appSecrets: data.appSecrets,
    imageTag,
    stripePriceIdPro: stripePriceIdProFor(env),
    ...(data.sesIdentity !== undefined && { sesIdentity: data.sesIdentity }),
    ...(mailFrom !== undefined && { mailFrom })
  })
}
