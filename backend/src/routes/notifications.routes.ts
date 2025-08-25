import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/rateLimit.middleware.stub';

const router = Router();

// Apply authentication to all notification routes
router.use(authenticate);

// Apply rate limiting
router.use(rateLimiter);

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [SESSION_DISCONNECTED, SESSION_RECONNECTED, SESSION_ERROR, SESSION_EXPIRED]
 *         description: Filter by notification type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SENT, FAILED, SUPPRESSED]
 *         description: Filter by notification status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of notifications per page
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 */
router.get('/', NotificationsController.getNotifications);

/**
 * @swagger
 * /api/v1/notifications/test:
 *   post:
 *     summary: Send test notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *               - type
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: Session ID to send test notification for
 *               type:
 *                 type: string
 *                 enum: [SESSION_DISCONNECTED, SESSION_RECONNECTED, SESSION_ERROR]
 *                 description: Type of test notification
 *     responses:
 *       200:
 *         description: Test notification sent successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Session not found
 */
router.post('/test', NotificationsController.sendTestNotification);

/**
 * @swagger
 * /api/v1/notifications/settings:
 *   get:
 *     summary: Get notification settings
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification settings retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/settings', NotificationsController.getNotificationSettings);

/**
 * @swagger
 * /api/v1/notifications/settings:
 *   put:
 *     summary: Update notification settings
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications:
 *                 type: boolean
 *                 description: Enable/disable email notifications
 *               notificationTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [SESSION_DISCONNECTED, SESSION_RECONNECTED, SESSION_ERROR, SESSION_EXPIRED]
 *                 description: Types of notifications to receive
 *               suppressionHours:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 24
 *                 default: 1
 *                 description: Hours to suppress duplicate notifications
 *     responses:
 *       200:
 *         description: Notification settings updated successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 */
router.put('/settings', NotificationsController.updateNotificationSettings);

/**
 * @swagger
 * /api/v1/notifications/{id}/mark-read:
 *   patch:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/mark-read', NotificationsController.markAsRead);

export default router;