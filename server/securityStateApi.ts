import { backupOperationsRouter } from "./backupOperationsApi";
import { dangerousActionsRouter } from "./dangerousActionsApi";
import { emailDeliverabilityRouter } from "./emailDeliverabilityApi";
import { securityStateRouter as coreSecurityStateRouter } from "./securityStateCore";

coreSecurityStateRouter.use("/dangerous-actions", dangerousActionsRouter);
coreSecurityStateRouter.use("/email", emailDeliverabilityRouter);
coreSecurityStateRouter.use("/backups", backupOperationsRouter);

export const securityStateRouter = coreSecurityStateRouter;
