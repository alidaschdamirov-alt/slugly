export function customDomainPlanFeature(limit: number) {
  return `${limit} custom domain${limit === 1 ? "" : "s"}`;
}
