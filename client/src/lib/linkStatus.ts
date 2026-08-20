export type {
  LinkStatus as LinkScheduleStatus,
  LinkStatusInput as LinkScheduleInput,
} from "@shared/link-status";

export {
  getLinkStatus as getEffectiveLinkStatus,
  getLinkStatusLabel as getEffectiveStatusLabel,
  getLinkStatusClass as getEffectiveStatusClass,
  getLinkStatusClass as getEffectiveStatusClassName,
  getLinkStatusLabel as getEffectiveLinkStatusLabel,
  isBrokenDestination,
} from "@shared/link-status";
