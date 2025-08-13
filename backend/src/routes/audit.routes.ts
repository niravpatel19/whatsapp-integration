import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { z } from 'zod';
import { AuditAction } from '../types/database.types';

const router = Router();

// Validation schemas
const getAuditTrailSchema = z.object({
  query: z.object({
    actor: z.string().optional(),
    action: z.nativeEnum(AuditAction).optional(),
    targetType: z.string().optional(),
    targetId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(1000)).optional(),
    skip: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).optional()
  })
});

const exportAuditDataSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    format: z.enum(['json', 'csv']).optional().default('json')
  })
});

const getUserActivitySchema = z.object({
  params: z.object({
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
  }),
  query: z.object({
    days: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(365)).optional()
  })
});

const securityEventsSchema = z.object({
  query: z.object({
    timeWindowHours: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(168)).optional()
  })
});

const verifyIntegritySchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
});

const complianceReportSchema = z.object({
  query: z.object({
    userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format').optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
});

// Apply authentication and rate limiting to all routes
router.use(authMiddleware);
router.use(rateLimitMiddleware({ windowMs: 15 * 60 * 1000, max: 100 })); // 100 requests per 15 minutes

/**
 * @swagger
 * /api/v1/audit/trail:
 *   get:
 *     summary: Get audit trail with filters
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: actor
 *         schema:
 *           type: string
 *         description: Filter by actor (email or API key)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [CREATE, UPDATE, DELETE, LOGIN, LOGOUT, API_KEY_GENERATED, SESSION_CREATED, MESSAGE_SENT]
 *         description: Filter by action type
 *       - in: query
 *         name: targetType
 *         schema:
 *           type: string
 *         description: Filter by target resource type
 *       - in: query
 *         name: targetId
 *         schema:
 *           type: string
 *         description: Filter by target resource ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter until this date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of records to return
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       200:
 *         description: Audit trail retrieved successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/trail', 
  validationMiddleware(getAuditTrailSchema),
  AuditController.getAuditTrail
);

/**
 * @swagger
 * /api/v1/audit/export:
 *   get:
 *     summary: Export audit data for compliance
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Export from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Export until this date
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Export format
 *     responses:
 *       200:
 *         description: Audit data exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/export',
  validationMiddleware(exportAuditDataSchema),
  AuditController.exportAuditData
);

/**
 * @swagger
 * /api/v1/audit/users/{userId}/activity:
 *   get:
 *     summary: Get user activity patterns
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to analyze
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to analyze
 *     responses:
 *       200:
 *         description: User activity patterns retrieved successfully
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get('/users/:userId/activity',
  validationMiddleware(getUserActivitySchema),
  AuditController.getUserActivity
);

/**
 * @swagger
 * /api/v1/audit/security-events:
 *   get:
 *     summary: Detect security events
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: timeWindowHours
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 168
 *           default: 24
 *         description: Time window in hours to analyze
 *     responses:
 *       200:
 *         description: Security events detected successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/security-events',
  validationMiddleware(securityEventsSchema),
  AuditController.getSecurityEvents
);

/**
 * @swagger
 * /api/v1/audit/verify-integrity:
 *   get:
 *     summary: Verify audit log integrity
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Verify from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Verify until this date
 *     responses:
 *       200:
 *         description: Integrity verification completed
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/verify-integrity',
  validationMiddleware(verifyIntegritySchema),
  AuditController.verifyIntegrity
);

/**
 * @swagger
 * /api/v1/audit/compliance-report:
 *   get:
 *     summary: Generate comprehensive compliance report
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by specific user ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Report from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Report until this date
 *     responses:
 *       200:
 *         description: Compliance report generated successfully
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/compliance-report',
  validationMiddleware(complianceReportSchema),
  AuditController.getComplianceReport
);

/**
 * @swagger
 * /api/v1/audit/cleanup:
 *   post:
 *     summary: Cleanup old audit logs (Admin only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionYears:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 7
 *                 description: Number of years to retain logs
 *     responses:
 *       200:
 *         description: Cleanup completed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin access required
 */
router.post('/cleanup',
  // TODO: Add admin-only middleware
  AuditController.cleanupOldLogs
);

export { router as auditRoutes };