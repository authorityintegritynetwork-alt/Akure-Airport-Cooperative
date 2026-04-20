import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import membersRouter from "./members";
import savingsRouter from "./savings";
import transactionsRouter from "./transactions";
import loansRouter from "./loans";
import storeRouter from "./store";
import notificationsRouter from "./notifications";
import auditRouter from "./audit";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import uploadsRouter from "./uploads";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(membersRouter);
router.use(savingsRouter);
router.use(transactionsRouter);
router.use(loansRouter);
router.use(storeRouter);
router.use(notificationsRouter);
router.use(auditRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(uploadsRouter);
router.use(storageRouter);

export default router;
