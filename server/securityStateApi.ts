import { dangerousActionsRouter } from "./dangerousActionsApi";
import { securityStateRouter as coreSecurityStateRouter } from "./securityStateCore";

coreSecurityStateRouter.use("/dangerous-actions", dangerousActionsRouter);

export const securityStateRouter = coreSecurityStateRouter;
