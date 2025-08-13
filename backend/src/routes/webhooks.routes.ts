import { Router } from 'express';

const router = Router();

// Placeholder routes - will be implemented in later tasks
router.get('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Webhooks list endpoint not yet implemented' 
    } 
  });
});

router.post('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Create webhook endpoint not yet implemented' 
    } 
  });
});

router.get('/:webhookId', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Get webhook endpoint not yet implemented' 
    } 
  });
});

router.delete('/:webhookId', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Delete webhook endpoint not yet implemented' 
    } 
  });
});

export default router;