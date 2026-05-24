import { Router } from 'express';

import { adminRouter } from '../modules/admin/admin.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { bookingsRouter } from '../modules/bookings/bookings.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { professionalsRouter } from '../modules/professionals/professionals.routes.js';
import { quotesRouter } from '../modules/quotes/quotes.routes.js';
import { reviewsRouter } from '../modules/reviews/reviews.routes.js';
import { serviceRequestsRouter } from '../modules/service-requests/service-requests.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use(categoriesRouter);
apiRouter.use(professionalsRouter);
apiRouter.use(reviewsRouter);
apiRouter.use(usersRouter);
apiRouter.use(serviceRequestsRouter);
apiRouter.use(quotesRouter);
apiRouter.use(bookingsRouter);
apiRouter.use(adminRouter);
