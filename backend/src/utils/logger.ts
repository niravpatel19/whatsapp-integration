import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which level to log based on environment
const level = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Define different log formats
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Define transports
const transports: winston.transport[] = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Ensure logs directory exists
  const logsDir = path.join(process.cwd(), 'logs');
  
  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Create a stream object for Morgan HTTP logging
export const loggerStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logWithContext = (level: string, message: string, context: any = {}) => {
  logger.log(level, message, {
    ...context,
    timestamp: new Date().toISOString(),
    service: 'whatsapp-integration',
  });
};

export const logError = (message: string, error: Error, context: any = {}) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
    timestamp: new Date().toISOString(),
    service: 'whatsapp-integration',
  });
};

export const logAudit = (action: string, userId: string, details: any = {}) => {
  logger.info('AUDIT', {
    action,
    userId,
    details,
    timestamp: new Date().toISOString(),
    service: 'whatsapp-integration',
    type: 'audit',
  });
};

export const logSecurity = (event: string, details: any = {}) => {
  logger.warn('SECURITY', {
    event,
    details,
    timestamp: new Date().toISOString(),
    service: 'whatsapp-integration',
    type: 'security',
  });
};

export const logPerformance = (operation: string, duration: number, details: any = {}) => {
  logger.info('PERFORMANCE', {
    operation,
    duration,
    details,
    timestamp: new Date().toISOString(),
    service: 'whatsapp-integration',
    type: 'performance',
  });
};

// Export default logger
export default logger;