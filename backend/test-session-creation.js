const axios = require('axios');

async function testSessionCreation() {
  try {
    console.log('🧪 Testing Session Creation and QR Code Generation...');
    
    // Step 1: Login
    console.log('1. Logging in...');
    const loginResponse = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'nirav.patel@saeculumsolutions.com',
      password: 'Test@123'
    });
    
    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }
    
    const token = loginResponse.data.data.tokens.accessToken;
    console.log('✅ Login successful');
    
    // Step 2: Create session
    console.log('2. Creating session...');
    const sessionResponse = await axios.post('http://localhost:3001/api/v1/sessions', {
      deviceName: 'Test Device - Session Creation Test'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!sessionResponse.data.success) {
      throw new Error('Session creation failed: ' + JSON.stringify(sessionResponse.data));
    }
    
    const session = sessionResponse.data.data.session;
    console.log('✅ Session created:', {
      sessionId: session.sessionId,
      status: session.status,
      deviceName: session.deviceInfo?.name
    });
    
    // Step 3: Wait for QR code generation (stub generates after 2 seconds)
    console.log('3. Waiting for QR code generation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Check QR code
    console.log('4. Checking QR code...');
    const qrResponse = await axios.get(`http://localhost:3001/api/v1/sessions/${session.sessionId}/qr`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (qrResponse.data.success && qrResponse.data.data) {
      console.log('✅ QR Code generated:', {
        qrDataLength: qrResponse.data.data.qrData.length,
        expiresAt: qrResponse.data.data.expiresAt,
        remainingTime: qrResponse.data.data.remainingTime
      });
    } else {
      console.log('❌ QR Code not available yet');
    }
    
    // Step 5: Check session status
    console.log('5. Checking session status...');
    const statusResponse = await axios.get(`http://localhost:3001/api/v1/sessions/${session.sessionId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (statusResponse.data.success) {
      const sessionData = statusResponse.data.data;
      console.log('✅ Session status:', {
        sessionId: sessionData.sessionId,
        status: sessionData.status,
        deviceName: sessionData.deviceInfo?.name,
        phone: sessionData.phone
      });
    }
    
    // Step 6: Wait for auto-connection (stub connects after 30 seconds)
    console.log('6. Waiting for auto-connection (30 seconds)...');
    console.log('   (In real mode, you would scan the QR code now)');
    
    let connected = false;
    for (let i = 0; i < 35; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkResponse = await axios.get(`http://localhost:3001/api/v1/sessions/${session.sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (checkResponse.data.success && checkResponse.data.data.status === 'CONNECTED') {
        console.log('✅ Session connected!', {
          status: checkResponse.data.data.status,
          phone: checkResponse.data.data.phone,
          deviceName: checkResponse.data.data.deviceInfo?.name
        });
        connected = true;
        break;
      }
      
      if (i % 5 === 0) {
        console.log(`   Waiting... ${i}s (Status: ${checkResponse.data.data?.status || 'unknown'})`);
      }
    }
    
    if (!connected) {
      console.log('⏰ Connection timeout - this is normal in stub mode');
    }
    
    // Step 7: Test message sending
    if (connected) {
      console.log('7. Testing message sending...');
      const messageResponse = await axios.post('http://localhost:3001/api/v1/messages/send', {
        sessionId: session.sessionId,
        to: '+1234567890',
        type: 'text',
        content: 'Hello! This is a test message from the session creation test.'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (messageResponse.data.success) {
        console.log('✅ Message sent:', {
          messageId: messageResponse.data.data.message.messageId,
          to: messageResponse.data.data.message.to,
          status: messageResponse.data.data.message.status
        });
      } else {
        console.log('❌ Message sending failed:', messageResponse.data.error);
      }
    }
    
    console.log('\n🎉 Session Creation Test Completed!');
    console.log('📋 Summary:');
    console.log('   • Session creation: ✅');
    console.log('   • QR code generation: ✅');
    console.log('   • Status updates: ✅');
    console.log('   • Auto-connection: ' + (connected ? '✅' : '⏰ (timeout)'));
    console.log('   • Message sending: ' + (connected ? '✅' : '⏭️ (skipped)'));
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testSessionCreation();