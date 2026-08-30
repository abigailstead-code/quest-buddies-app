import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questRoadRouter from "./quest-road";

const router: IRouter = Router();

router.use(healthRouter);
router.use(questRoadRouter);

export default router;
