import { Router } from 'express';

const router = Router();

// Placeholder routes - will be implemented in later tasks
router.post('/register', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Registration endpoint not yet implemented' 
    } 
  });
});

router.post('/login', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Login endpoint not yet implemented' 
    } 
  });
});

router.post('/logout', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Logout endpoint not yet implemented' 
    } 
  });
});

router.get('/profile', (req, res) => {
  res.status(501).json({ 
    error: { 
      code: 'NOT_IMPLEMENTED', 
      message: 'Profile endpoint not yet implemented' 
    } 
  });
});

export default router;