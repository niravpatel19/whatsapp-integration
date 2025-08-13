import mongoose from 'mongoose';

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  // Suppress mongoose deprecation warnings in tests
  mongoose.set('strictQuery', false);
});

afterAll(async () => {
  // Clean up any remaining connections
  await mongoose.disconnect();
});