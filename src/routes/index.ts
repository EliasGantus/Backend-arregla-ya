import { Router } from 'express';

import { adminRouter } from '../modules/admin/admin.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { quotesRouter } from '../modules/quotes/quotes.routes.js';
import { serviceRequestsRouter } from '../modules/service-requests/service-requests.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use(categoriesRouter);
apiRouter.use(usersRouter);
apiRouter.use(serviceRequestsRouter);
apiRouter.use(quotesRouter);
apiRouter.use(adminRouter);
