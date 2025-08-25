#!/usr/bin/env ts-node
/**
 * Test session creation functionality
 * Usage: npm run test-session
 */
import axios from 'axios';

const BASE_URL = 'http://localhost:8000/api/v1';

async function testSessionCreation(): Promise<void> {
  try {
    console.log('🧪 Testing Session Creation\n');

    // Test session creation
    console.log('1. Creating new session...');
    const createResponse = await axios.post(`${BASE_URL}/sessions`, {
      deviceName: 'Test Session Creation',
    });

    if (createResponse.data.success) {
      const sessionId = createResponse.data.data.sessionId;
      console.log(`   ✅ Session created: ${sessionId}`);
      console.log(`   Status: ${createResponse.data.data.status}`);
      
      // Wait a moment for QR generation
      console.log('\n2. Waiting for QR code generation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check for QR code
      try {
        const qrResponse = await axios.get(`${BASE_URL}/sessions/${sessionId}/qr`);
        if (qrResponse.data.success) {
          console.log(`   ✅ QR code generated successfully`);
          console.log(`   QR data length: ${qrResponse.data.data.qrData.length} characters`);
          console.log(`   Expires: ${qrResponse.data.data.expiresAt}`);
          console.log(`   Attempts: ${qrResponse.data.data.tries}`);
        }
      } catch (qrError: any) {
        if (qrError.response?.status === 404) {
          console.log(`   ⏳ QR code not ready yet: ${qrError.response.data.error.details}`);
        } else {
          console.log(`   ❌ QR code error: ${qrError.message}`);
        }
      }
      
      // Get session details
      console.log('\n3. Getting session details...');
      const detailsResponse = await axios.get(`${BASE_URL}/sessions/${sessionId}`);
      if (detailsResponse.data.success) {
        console.log(`   ✅ Session details retrieved`);
        console.log(`   Status: ${detailsResponse.data.data.status}`);
        console.log(`   Device: ${detailsResponse.data.data.deviceInfo.name}`);
      }
      
      console.log('\n🎉 Session creation test completed successfully!');
      console.log(`\n💡 Session ID: ${sessionId}`);
      console.log('   You can now scan the QR code to connect WhatsApp');
      
    } else {
      console.log('   ❌ Failed to create session');
    }
  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n🔧 Make sure your server is running:');
      console.log('   npm run dev');
    }
  }
}

// Run the test
testSessionCreation()
  .then(() => {
    console.log('\nTest completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });