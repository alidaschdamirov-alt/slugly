export const AUDIT_EVENTS = {
  ADMIN_MUTATION: "admin.mutation",

  USER_ROLE_CHANGE: "user.role_change",
  BILLING_CHANGE_PLAN: "billing.change_plan",
  SETTINGS_UPDATE: "settings.update",
  EMAIL_CONFIG_UPDATED: "email.config_updated",
  EMAIL_TEMPLATE_UPDATED: "email.template_updated",
  EMAIL_TEMPLATE_PREVIEW: "email.template_preview",
  EMAIL_TEST_SEND: "email.test_send",

  USER_SUSPEND: "user.suspend",
  USER_UNSUSPEND: "user.unsuspend",
  USER_DELETE: "user.delete",
  USER_SOFT_DELETE: "user.soft_delete",
  USER_RESTORE: "user.restore",
  USER_PURGE: "user.purge",
  USER_IMPERSONATE: "user.impersonate",
  USER_IMPERSONATE_ACTION: "user.impersonate_action",
  USER_IMPERSONATE_EXIT: "user.impersonate_exit",
  LINK_PAUSE: "link.pause",
  LINK_RESUME: "link.resume",
  LINK_DELETE: "link.delete",
  LINK_SOFT_DELETE: "link.soft_delete",
  LINK_RESTORE: "link.restore",
  LINK_PURGE: "link.purge",
  LINK_QUARANTINE: "link.quarantine",
  LINK_BULK_CLEANUP: "link.bulk_cleanup",
  LINK_BULK_CLEANUP_PREVIEW: "link.bulk_cleanup_preview",
  DOMAIN_BLOCK: "domain.block",
  DOMAIN_UNBLOCK: "domain.unblock",
  REPORT_RESOLVE: "report.resolve",
  REPORT_REJECT: "report.reject",
  REPORT_ASSIGN: "report.assign",
  REPORT_STATUS_CHANGE: "report.status_change",
  REPORT_RESPONSE: "report.response",
  APPEAL_SUBMIT: "appeal.submit",
  APPEAL_DECIDE: "appeal.decide",
  LEGAL_REQUEST_CREATE: "legal_request.create",
  LEGAL_REQUEST_UPDATE: "legal_request.update",
  NOTIFICATION_SEND: "notification.send",
  BACKUP_EXPORT: "backup.export",
  PLAN_LIMITS_UPDATE: "plan.limits_update",
  PLAN_CONFIGS_UPDATE: "plan.configs_update",
  WORKSPACE_PLAN_OVERRIDE: "workspace.plan_override",
  RESERVED_SLUGS_UPDATE: "config.reserved_slugs",

  SAFETY_DESTINATION_REJECTED: "security.destination_rejected",
  SAFETY_CHECK_UNKNOWN: "security.safe_browsing_unknown",
} as const;

export type AuditEvent = typeof AUDIT_EVENTS[keyof typeof AUDIT_EVENTS];
export type AuditTargetType =
  | "user"
  | "link"
  | "workspace"
  | "domain"
  | "report"
  | "appeal"
  | "legal_request"
  | "notification"
  | "email_template"
  | "system";

export interface AuditEntry {
  event: AuditEvent;
  actorId: number;
  actorName?: string | null;
  targetType: AuditTargetType;
  targetId: string | number | null;
  payload?: Record<string, unknown>;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

export const AUDIT_REASON_REQUIRED = new Set<AuditEvent>([
  AUDIT_EVENTS.USER_SUSPEND,
  AUDIT_EVENTS.USER_DELETE,
  AUDIT_EVENTS.USER_SOFT_DELETE,
  AUDIT_EVENTS.USER_PURGE,
  AUDIT_EVENTS.USER_IMPERSONATE,
  AUDIT_EVENTS.LINK_PAUSE,
  AUDIT_EVENTS.LINK_DELETE,
  AUDIT_EVENTS.LINK_SOFT_DELETE,
  AUDIT_EVENTS.LINK_PURGE,
  AUDIT_EVENTS.LINK_BULK_CLEANUP,
  AUDIT_EVENTS.DOMAIN_BLOCK,
  AUDIT_EVENTS.DOMAIN_UNBLOCK,
]);

export function auditEventRequiresReason(event: AuditEvent): boolean {
  return AUDIT_REASON_REQUIRED.has(event);
}
