import { createBillingDialog, createSupportTicketDialog } from './SupportTicketFlow.js';
import { createHumanHandoffDialog } from './HumanHandoffFlow.js';
import { createMainMenuDialog, createOnboardingDialog } from './OnboardingAndMenuFlow.js';
import { createAmbiguityResolverDialog, createHelpDialog } from '../router/AmbiguityResolverDialog.js';

export function registerEnterpriseDialogs(dialogSet) {
  return dialogSet
    .add(createOnboardingDialog())
    .add(createMainMenuDialog())
    .add(createSupportTicketDialog())
    .add(createBillingDialog())
    .add(createHumanHandoffDialog())
    .add(createHelpDialog())
    .add(createAmbiguityResolverDialog());
}
