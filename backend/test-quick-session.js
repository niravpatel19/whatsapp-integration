const axios = require('axios');

async function quickSessionTest() {
  try {
    console.log('🔧 Quick Session Creation Test...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:3001/api/v1/auth/login', {
      email: 'nirav.patel@saeculumsolutions.com',
      password: 'Test@123'
    });
    
    const token = loginResponse.data.data.tokens.accessToken;
    console.log('✅ Login successful');
    
    // Create session
    const sessionResponse = await axios.post('http://localhost:3001/api/v1/sessions', {
      deviceName: 'Quick Test Device'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (sessionResponse.data.success) {
      const session = sessionResponse.data.data.session;
      console.log('✅ Session created successfully!');
      console.log('   Session ID:', session.sessionId);
      console.log('   Status:', session.status);
      console.log('   Device:', session.deviceInfo?.name);
      
      // Wait a bit and check status
      setTimeout(async () => {
        try {
          const statusResponse = await axios.get(`http://localhost:3001/api/v1/sessions/${session.sessionId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          console.log('📊 Session status after 5 seconds:');
          console.log('   Status:', statusResponse.data.data.session?.status || 'unknown');
          
          // Try to get QR code
          try {
            const qrResponse = await axios.get(`http://localhost:3001/api/v1/sessions/${session.sessionId}/qr`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            if (qrResponse.data.success) {
              console.log('✅ QR Code available!');
              console.log('   QR Data Length:', qrResponse.data.data.qrData?.length || 0);
            } else {
              console.log('⏳ QR Code not ready yet');
            }
          } catch (qrError) {
            console.log('⏳ QR Code not available yet');
          }
          
        } catch (error) {
          console.error('❌ Status check failed:', error.response?.data || error.message);
        }
      }, 5000);
      
    } else {
      console.error('❌ Session creation failed:', sessionResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

quickSessionTest();