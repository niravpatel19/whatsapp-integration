import mongoose from 'mongoose';
import { User } from '../models/User.model';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function createDefaultUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findByEmail('nirav.patel@saeculumsolutions.com');
    if (existingUser) {
      logger.info('User already exists: nirav.patel@saeculumsolutions.com');
      return;
    }

    // Create the default user
    const defaultUser = await User.createUser({
      email: 'nirav.patel@saeculumsolutions.com',
      password: 'Test@123',
      name: 'Nirav Patel'
    });

    logger.info('Default user created successfully:', {
      id: defaultUser._id,
      email: defaultUser.email,
      name: defaultUser.name,
      createdAt: defaultUser.createdAt
    });

    console.log('✅ Default user created successfully!');
    console.log('📧 Email: nirav.patel@saeculumsolutions.com');
    console.log('🔑 Password: Test@123');
    console.log('👤 Name: Nirav Patel');

  } catch (error) {
    logger.error('Failed to create default user:', error);
    console.error('❌ Failed to create default user:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await mongoose.connection.close();
    logger.info('Database connection closed');
    process.exit(0);
  }
}

// Run the script
createDefaultUser();