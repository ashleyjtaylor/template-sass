import { z } from 'zod'

export const accessStateSchema = z.object({
  state: z.enum(['paid', 'past_due', 'paywalled']),
  subscription: z
    .object({
      planKey: z.string(),
      status: z.string(),
      currentPeriodEnd: z.string(),
      cancelAtPeriodEnd: z.boolean()
    })
    .optional()
})

export type AccessState = z.infer<typeof accessStateSchema>

export const sessionUrlSchema = z.object({ url: z.string().url() })

export type SessionUrl = z.infer<typeof sessionUrlSchema>

export const previewPlanChangeSchema = z.object({
  amountDueCents: z.number().int(),
  currency: z.string(),
  prorationDateUnix: z.number().int().positive()
})

export type PreviewPlanChange = z.infer<typeof previewPlanChangeSchema>

export const changePlanResultSchema = z.object({ status: z.literal('ok') })
