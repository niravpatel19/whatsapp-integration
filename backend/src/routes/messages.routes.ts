import { Router } from 'express';

const router = Router();

// Placeholder routes - will be implemented in later tasks
router.post('/send', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Send message endpoint not yet implemented' 
    } 
  });
});

router.get('/:messageId', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Get message endpoint not yet implemented' 
    } 
  });
});

router.get('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Messages list endpoint not yet implemented' 
    } 
  });
});

export default router;