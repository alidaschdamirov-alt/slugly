export const BILLING_UNAVAILABLE_MESSAGE =
  "Online plan changes are unavailable until secure checkout is connected.";

interface BillingEnvironment {
  NODE_ENV?: string;
  ALLOW_SIMULATED_PLAN_CHANGES?: string;
}

export function isDirectPlanChangeEnabled(
  environment: BillingEnvironment = process.env as BillingEnvironment,
) {
  return environment.NODE_ENV !== "production"
    && environment.ALLOW_SIMULATED_PLAN_CHANGES === "true";
}
