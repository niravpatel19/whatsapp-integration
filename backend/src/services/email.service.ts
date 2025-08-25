import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private isConfigured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn('Email service not configured - missing SMTP credentials');
      this.isConfigured = false;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    });

    this.isConfigured = true;
    logger.info('Email service initialized successfully');
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured - skipping email send');
      return false;
    }

    try {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${options.to}`, {
        messageId: result.messageId,
        subject: options.subject,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email:', error, {
        to: options.to,
        subject: options.subject,
      });
      return false;
    }
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection test successful');
      return true;
    } catch (error) {
      logger.error('Email service connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();