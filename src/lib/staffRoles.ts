export type BusinessStaffRole = 'admin' | 'support' | 'technical'

export function isFrontlineStaff(role: BusinessStaffRole | null | undefined): boolean {
  return role === 'admin' || role === 'support'
}

export function isTechnicalStaff(role: BusinessStaffRole | null | undefined): boolean {
  return role === 'admin' || role === 'technical'
}

export function staffRoleLabel(role: BusinessStaffRole | null | undefined): string {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'support':
      return 'Support'
    case 'technical':
      return 'Technical'
    default:
      return 'Staff'
  }
}
