import { Router } from 'express';
import { verifyToken } from './auth';

const apiRouter = Router();

// Mount sub-routers
import { visitorRouter } from './visitor';
import { adminRouter } from './admin';
import { authRouter } from './auth';

apiRouter.use('/auth', authRouter);
apiRouter.use('/visitor', visitorRouter);
apiRouter.use('/admin', verifyToken, adminRouter);

export { apiRouter };
