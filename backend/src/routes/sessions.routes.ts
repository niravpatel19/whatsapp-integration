import { Router } from 'express';

const router = Router();

// Placeholder routes - will be implemented in later tasks
router.get('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Sessions list endpoint not yet implemented' 
    } 
  });
});

router.post('/', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Create session endpoint not yet implemented' 
    } 
  });
});

router.get('/:sessionId', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Get session endpoint not yet implemented' 
    } 
  });
});

router.delete('/:sessionId', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Delete session endpoint not yet implemented' 
    } 
  });
});

export default router;