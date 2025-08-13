import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { UserStatus, VALIDATION_PATTERNS, FIELD_LIMITS } from '../types/database.types';

// Interface for User document
export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  twoFAEnabled: boolean;
  twoFASecret?: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  comparePassword(password: string): Promise<boolean>;
  generateTwoFASecret(): { secret: string; qrCodeUrl: string };
  validateTOTP(token: string): boolean;
}

// Interface for User model (static methods)
export interface IUserModel extends Model<IUser> {
  createUser(userData: {
    email: string;
    password: string;
    name: string;
  }): Promise<IUser>;
  findByEmail(email: string): Promise<IUser | null>;
  validatePassword(password: string): { isValid: boolean; errors: string[] };
  updateProfile(userId: string, updates: Partial<{
    name: string;
    email: string;
  }>): Promise<IUser | null>;
  enableTwoFA(userId: string, secret: string): Promise<IUser | null>;
  disableTwoFA(userId: string): Promise<IUser | null>;
}

// Use shared email validation pattern
const EMAIL_REGEX = VALIDATION_PATTERNS.EMAIL;

// Password validation function
const validatePasswordStrength = (password: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// User schema definition
const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [FIELD_LIMITS.EMAIL_MAX, 'Email cannot exceed 254 characters'],
    validate: {
      validator: function(email: string) {
        return EMAIL_REGEX.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [60, 'Invalid password hash'] // bcrypt hash length
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [1, 'Name cannot be empty'],
    maxlength: [FIELD_LIMITS.NAME_MAX, 'Name cannot exceed 100 characters']
  },
  twoFAEnabled: {
    type: Boolean,
    default: false
  },
  twoFASecret: {
    type: String,
    select: false // Don't include in queries by default for security
  },
  status: {
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  collection: 'users'
});

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ status: 1 });
UserSchema.index({ createdAt: 1 });

// Instance Methods
UserSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, this.passwordHash);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

UserSchema.methods.generateTwoFASecret = function(): { secret: string; qrCodeUrl: string } {
  const secret = speakeasy.generateSecret({
    name: `WhatsApp Integration (${this.email})`,
    issuer: 'WhatsApp Integration Service',
    length: 20
  });
  
  return {
    secret: secret.base32,
    qrCodeUrl: secret.otpauth_url || ''
  };
};

UserSchema.methods.validateTOTP = function(token: string): boolean {
  if (!this.twoFAEnabled || !this.twoFASecret) {
    return false;
  }
  
  return speakeasy.totp.verify({
    secret: this.twoFASecret,
    encoding: 'base32',
    token: token,
    window: 1 // Allow ±1 time window (30 seconds before/after)
  });
};

// Static Methods
UserSchema.statics.createUser = async function(userData: {
  email: string;
  password: string;
  name: string;
}): Promise<IUser> {
  const { email, password, name } = userData;
  
  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.isValid) {
    const error = new Error('Password validation failed');
    (error as any).details = passwordValidation.errors;
    throw error;
  }
  
  // Check if user already exists
  const existingUser = await this.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error('User with this email already exists');
  }
  
  // Hash password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  
  // Create user
  const user = new this({
    email: email.toLowerCase(),
    passwordHash,
    name: name.trim(),
    status: UserStatus.ACTIVE
  });
  
  return await user.save();
};

UserSchema.statics.findByEmail = async function(email: string): Promise<IUser | null> {
  return await this.findOne({ 
    email: email.toLowerCase(),
    status: { $ne: UserStatus.DELETED }
  });
};

UserSchema.statics.validatePassword = function(password: string): { isValid: boolean; errors: string[] } {
  return validatePasswordStrength(password);
};

UserSchema.statics.updateProfile = async function(
  userId: string, 
  updates: Partial<{ name: string; email: string }>
): Promise<IUser | null> {
  const allowedUpdates = ['name', 'email'];
  const updateData: any = {};
  
  // Filter allowed updates
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key) && updates[key as keyof typeof updates] !== undefined) {
      if (key === 'email') {
        updateData[key] = updates[key]?.toLowerCase();
      } else {
        updateData[key] = updates[key as keyof typeof updates];
      }
    }
  });
  
  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid updates provided');
  }
  
  // If email is being updated, check for duplicates
  if (updateData.email) {
    const existingUser = await this.findOne({ 
      email: updateData.email,
      _id: { $ne: userId },
      status: { $ne: UserStatus.DELETED }
    });
    if (existingUser) {
      throw new Error('Email already in use by another user');
    }
  }
  
  return await this.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  );
};

UserSchema.statics.enableTwoFA = async function(userId: string, secret: string): Promise<IUser | null> {
  return await this.findByIdAndUpdate(
    userId,
    { 
      $set: { 
        twoFAEnabled: true,
        twoFASecret: secret
      }
    },
    { new: true }
  );
};

UserSchema.statics.disableTwoFA = async function(userId: string): Promise<IUser | null> {
  return await this.findByIdAndUpdate(
    userId,
    { 
      $set: { 
        twoFAEnabled: false
      },
      $unset: {
        twoFASecret: 1
      }
    },
    { new: true }
  );
};

// Pre-save middleware for additional validation
UserSchema.pre('save', function(next) {
  // Ensure email is lowercase
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  
  // Trim name
  if (this.isModified('name')) {
    this.name = this.name.trim();
  }
  
  next();
});

// Create and export the model
export const User: IUserModel = mongoose.model<IUser, IUserModel>('User', UserSchema);