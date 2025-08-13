import { Router } from 'express';

const router = Router();

// Placeholder routes - will be implemented in later tasks
router.get('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Events list endpoint not yet implemented' 
    } 
  });
});

router.get('/types', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Event types endpoint not yet implemented' 
    } 
  });
});

router.get('/stats', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Event stats endpoint not yet implemented' 
    } 
  });
});

export default router;