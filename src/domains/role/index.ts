/**
 * Role Domain - SINGLE SOURCE OF TRUTH for user role determination
 * 
 * UI components MUST use these functions instead of:
 * - Direct userId comparisons
 * - Checking agreement.lender_id === user.id
 */

export { 
  getUserRoleInAgreement, 
  isUserLender, 
  isUserBorrower 
} from './getUserRoleInAgreement';
