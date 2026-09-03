import { getLinkStatus, type LinkStatusInput } from "../shared/link-status";

export function countActiveProjectLinks(links: LinkStatusInput[], now = Date.now()) {
  return links.filter(link => getLinkStatus(link, now) === "active").length;
}
