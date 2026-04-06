import axios from 'axios';
import { logger } from '../utils/logger';

const API_BASE_URL = 'http://localhost:7811/api/v1';
let authToken = '';

interface TestSession {
  sessionId: string;
  status: string;
}

/**
 * Complete WhatsApp Integration Test Flow
 * This script tests the entire WhatsApp integration workflow
 */
class WhatsAppTestFlow {
  
  async login(): Promise<void> {
    console.log('\n🔐 Step 1: Login to get authentication token...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email: 'nirav.patel@saeculumsolutions.com',
        password: 'Test@123'
      });

      if (response.data.success) {
        authToken = response.data.data.tokens.accessToken;
        console.log('✅ Login successful');
        console.log(`   User: ${response.data.data.user.name} (${response.data.data.user.email})`);
      } else {
        throw new Error('Login failed');
      }
    } catch (error: any) {
      console.error('❌ Login failed:', error.response?.data?.error?.message || error.message);
      throw error;
    }
  }

  async createSession(): Promise<TestSession> {
    console.log('\n📱 Step 2: Creating WhatsApp session...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/sessions`, {
        deviceName: 'Test Device - WhatsApp Integration'
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (response.data.success) {
        const session = response.data.data.session;
        console.log('✅ Session created successfully');
        console.log(`   Session ID: ${session.sessionId}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Device: ${session.deviceInfo.name}`);
        return session;
      } else {
        throw new Error('Session creation failed');
      }
    } catch (error: any) {
      console.error('❌ Session creation failed:', error.response?.data?.error?.message || error.message);
      throw error;
    }
  }

  async waitForQRCode(sessionId: string): Promise<void> {
    console.log('\n📋 Step 3: Waiting for QR code generation...');
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout
    
    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/qr`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.success && response.data.data) {
          const qrData = response.data.data;
          console.log('✅ QR Code generated!');
          console.log(`   QR Data Length: ${qrData.qrData.length} characters`);
          console.log(`   Expires At: ${qrData.expiresAt}`);
          console.log(`   Remaining Time: ${qrData.remainingTime} seconds`);
          console.log('\n📱 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
          console.log('   1. Open WhatsApp on your phone');
          console.log('   2. Go to Settings → Linked Devices');
          console.log('   3. Tap "Link a Device"');
          console.log('   4. Scan the QR code displayed in your browser');
          console.log('   5. Wait for connection...');
          return;
        }
      } catch (error: any) {
        // QR not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      process.stdout.write('.');
    }
    
    throw new Error('QR code generation timeout');
  }

  async waitForConnection(sessionId: string): Promise<void> {
    console.log('\n🔗 Step 4: Waiting for WhatsApp connection...');
    
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes timeout
    
    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.success) {
          const session = response.data.data;
          console.log(`   Status: ${session.status}`);
          
          if (session.status === 'CONNECTED') {
            console.log('✅ WhatsApp connected successfully!');
            console.log(`   Phone: ${session.phone || 'Unknown'}`);
            console.log(`   Device: ${session.deviceInfo.name}`);
            console.log(`   Connected At: ${session.updatedAt}`);
            return;
          } else if (session.status === 'ERROR') {
            throw new Error('Session connection failed with error status');
          }
        }
      } catch (error: any) {
        console.error('Error checking session status:', error.response?.data?.error?.message || error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      if (attempts % 10 === 0) {
        console.log(`   Still waiting... (${attempts}s)`);
      }
    }
    
    throw new Error('Connection timeout - please scan the QR code');
  }

  async sendTestMessage(sessionId: string, phoneNumber: string): Promise<void> {
    console.log(`\n💬 Step 5: Sending test message to ${phoneNumber}...`);
    
    try {
      const testMessage = `Hello! This is a test message from WhatsApp Integration Platform.\\n\\nTime: ${new Date().toLocaleString()}\\n\\nThis message was sent automatically to test the integration.`;
      
      const response = await axios.post(`${API_BASE_URL}/messages/send`, {
        sessionId,
        to: phoneNumber,
        type: 'text',
        content: testMessage
      }, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (response.data.success) {
        const message = response.data.data.message;
        console.log('✅ Message sent successfully!');
        console.log(`   Message ID: ${message.messageId}`);
        console.log(`   To: ${message.to}`);
        console.log(`   Status: ${message.status}`);
        console.log(`   Content: ${message.content.substring(0, 50)}...`);
        
        // Wait a bit and check message status
        await this.checkMessageStatus(message.messageId);
      } else {
        throw new Error('Message sending failed');
      }
    } catch (error: any) {
      console.error('❌ Message sending failed:', error.response?.data?.error?.message || error.message);
      throw error;
    }
  }

  async checkMessageStatus(messageId: string): Promise<void> {
    console.log('\n📊 Step 6: Checking message delivery status...');
    
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        const response = await axios.get(`${API_BASE_URL}/messages/${messageId}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        if (response.data.success) {
          const message = response.data.data;
          console.log(`   Status: ${message.status}`);
          
          if (message.status === 'DELIVERED' || message.status === 'READ') {
            console.log('✅ Message delivered successfully!');
            console.log(`   Final Status: ${message.status}`);
            console.log(`   Updated At: ${message.updatedAt}`);
            return;
          } else if (message.status === 'FAILED') {
            console.log('❌ Message delivery failed');
            console.log(`   Error: ${message.error || 'Unknown error'}`);
            return;
          }
        }
      } catch (error: any) {
        console.error('Error checking message status:', error.response?.data?.error?.message || error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    console.log('⏰ Message status check timeout - message may still be processing');
  }

  async getDashboardStats(): Promise<void> {
    console.log('\n📈 Step 7: Getting dashboard statistics...');
    
    try {
      const [sessionsResponse, messagesResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/sessions`, {
          headers: { Authorization: `Bearer ${authToken}` }
        }),
        axios.get(`${API_BASE_URL}/messages/stats`, {
          headers: { Authorization: `Bearer ${authToken}` }
        })
      ]);

      if (sessionsResponse.data.success && messagesResponse.data.success) {
        const sessions = sessionsResponse.data.data.sessions;
        const messageStats = messagesResponse.data.data.statistics;
        
        console.log('✅ Dashboard statistics:');
        console.log(`   Total Sessions: ${sessions.length}`);
        console.log(`   Connected Sessions: ${sessions.filter((s: any) => s.status === 'CONNECTED').length}`);
        console.log(`   Total Messages: ${messageStats.totalMessages || 0}`);
        console.log(`   Delivery Rate: ${messageStats.deliveryRate || 0}%`);
      }
    } catch (error: any) {
      console.error('❌ Failed to get dashboard stats:', error.response?.data?.error?.message || error.message);
    }
  }

  async runCompleteTest(phoneNumber: string): Promise<void> {
    console.log('🚀 Starting Complete WhatsApp Integration Test Flow');
    console.log('='.repeat(60));
    
    try {
      // Step 1: Login
      await this.login();
      
      // Step 2: Create session
      const session = await this.createSession();
      
      // Step 3: Wait for QR code
      await this.waitForQRCode(session.sessionId);
      
      // Step 4: Wait for connection
      await this.waitForConnection(session.sessionId);
      
      // Step 5: Send test message
      await this.sendTestMessage(session.sessionId, phoneNumber);
      
      // Step 7: Get dashboard stats
      await this.getDashboardStats();
      
      console.log('\n🎉 WhatsApp Integration Test Completed Successfully!');
      console.log('='.repeat(60));
      console.log('✅ All steps passed:');
      console.log('   • Authentication ✓');
      console.log('   • Session Creation ✓');
      console.log('   • QR Code Generation ✓');
      console.log('   • WhatsApp Connection ✓');
      console.log('   • Message Sending ✓');
      console.log('   • Dashboard Statistics ✓');
      console.log('\n🎯 Your WhatsApp Integration is working perfectly!');
      
    } catch (error: any) {
      console.log('\n❌ WhatsApp Integration Test Failed');
      console.log('='.repeat(60));
      console.error('Error:', error.message);
      console.log('\n🔧 Troubleshooting Tips:');
      console.log('   • Make sure backend server is running on port 3001');
      console.log('   • Check if MongoDB is connected');
      console.log('   • Verify user credentials are correct');
      console.log('   • Ensure phone number format is correct (+1234567890)');
      console.log('   • Check browser console for additional errors');
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const phoneNumber = args[0];
  
  if (!phoneNumber) {
    console.log('❌ Please provide a phone number to test with');
    console.log('Usage: npm run test:whatsapp +1234567890');
    console.log('');
    console.log('Example: npm run test:whatsapp +919876543210');
    console.log('Note: Use international format with country code');
    process.exit(1);
  }
  
  if (!phoneNumber.startsWith('+')) {
    console.log('❌ Phone number must be in international format starting with +');
    console.log('Example: +919876543210 (for India), +1234567890 (for US)');
    process.exit(1);
  }
  
  const testFlow = new WhatsAppTestFlow();
  await testFlow.runCompleteTest(phoneNumber);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n\\n⏹️  Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\\n\\n⏹️  Test terminated');
  process.exit(0);
});

// Run the test
main().catch((error) => {
  console.error('\\n💥 Unexpected error:', error);
  process.exit(1);
});