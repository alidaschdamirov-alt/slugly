import { dangerousActionsRouter } from "./dangerousActionsApi";
import { emailDeliverabilityRouter } from "./emailDeliverabilityApi";
import { securityStateRouter as coreSecurityStateRouter } from "./securityStateCore";

coreSecurityStateRouter.use("/dangerous-actions", dangerousActionsRouter);
coreSecurityStateRouter.use("/email", emailDeliverabilityRouter);

export const securityStateRouter = coreSecurityStateRouter;
