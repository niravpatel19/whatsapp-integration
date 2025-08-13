import { Router } from 'express';
import { EventsController } from '../controllers/events.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Events routes
router.get('/', EventsController.getEvents);
router.get('/types', EventsController.getEventTypes);
router.get('/stats', EventsController.getEventStats);
router.get('/session/:sessionId', EventsController.getSessionEvents);
router.get('/type/:type', EventsController.getEventsByType);

export default router;