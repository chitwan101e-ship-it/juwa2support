export type EscalationStatus = 'pending' | 'claimed' | 'resolved'

export type EscalationRow = {
  id: string
  conversation_id: string
  reason: string
  status: EscalationStatus
  escalated_by: string
  claimed_by: string | null
  created_at: string
  claimed_at: string | null
}

export const CUSTOMER_ESCALATION_HANDOFF_MESSAGE =
  'Thanks for your patience — our technical team is now reviewing your issue. We will follow up here shortly.'

export function isActiveEscalation(status: EscalationStatus): boolean {
  return status === 'pending' || status === 'claimed'
}

export function canEscalateThread(
  businessRole: 'admin' | 'support' | 'technical' | null,
  hasActiveEscalation: boolean
): boolean {
  return (businessRole === 'admin' || businessRole === 'support') && !hasActiveEscalation
}

export function canClaimEscalation(
  businessRole: 'admin' | 'support' | 'technical' | null,
  escalation: EscalationRow | null | undefined
): boolean {
  return (
    (businessRole === 'admin' || businessRole === 'technical') &&
    escalation?.status === 'pending'
  )
}

export function canResolveEscalation(
  businessRole: 'admin' | 'support' | 'technical' | null,
  staffId: string,
  escalation: EscalationRow | null | undefined
): boolean {
  if (!escalation || escalation.status !== 'claimed') return false
  if (businessRole === 'admin') return true
  return businessRole === 'technical' && escalation.claimed_by === staffId
}
