const axios = require('axios');

async function testEventsAPI() {
  try {
    console.log('Testing Events API...');
    
    // First login to get token
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
    
    // Test events endpoint
    console.log('2. Testing events endpoint...');
    const eventsResponse = await axios.get('http://localhost:3001/api/v1/events?limit=10', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Events API Response:', JSON.stringify(eventsResponse.data, null, 2));
    
    // Test event types endpoint
    console.log('3. Testing event types endpoint...');
    const typesResponse = await axios.get('http://localhost:3001/api/v1/events/types', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Event Types API Response:', JSON.stringify(typesResponse.data, null, 2));
    
    console.log('🎉 All tests passed! Events API is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testEventsAPI();