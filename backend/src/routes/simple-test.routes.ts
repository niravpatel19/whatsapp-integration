import { Router } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { create } from '@wppconnect-team/wppconnect';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

const router = Router();

// Simple in-memory storage (like working setup)
const whatsappSessions: { [key: string]: { client: any; status: string; qr: string | null } } = {};
const whatsappSockets: { [key: string]: string } = {};

let io: SocketIOServer;

export const initializeSimpleTest = (socketServer: SocketIOServer) => {
  io = socketServer;
  
  // Setup socket handlers for simple test (exactly like working setup)
  io.on('connection', (socket) => {
    
    socket.on('connect_whatsapp', async ({ whatsappId }) => {
      if (!whatsappId) return socket.emit('whatsapp_error', { error: 'No whatsappId provided' });

      whatsappSockets[whatsappId] = socket.id;
      const session = whatsappSessions[whatsappId];

      if (session?.client) {
        try {
          const currentState = await session.client.getConnectionState();
          return socket.emit('whatsapp_status', { status: currentState });
        } catch (error) {
          return socket.emit('whatsapp_status', { status: 'error' });
        }
      }

      if (session?.status === 'creating' || session?.status === 'qr') {
        socket.emit('whatsapp_status', { status: session.status });
        if (session.qr) {
          socket.emit('whatsapp_qr', { qrCode: session.qr });
        }
        return;
      }

      await startSession(whatsappId, socket);
    });

    socket.on('send_whatsapp_message', async ({ whatsappId, chatId, message }) => {
      const client = whatsappSessions[whatsappId]?.client;
      if (!client) return socket.emit('whatsapp_error', { error: 'WhatsApp client not connected' });

      try {
        const result = await client.sendText(chatId, message);
        socket.emit('whatsapp_messages_success', { message: result });
      } catch (err: any) {
        socket.emit('whatsapp_error', { error: err.message });
      }
    });

    socket.on('disconnect', () => {
      for (const [whatsappId, sid] of Object.entries(whatsappSockets)) {
        if (sid === socket.id) {
          delete whatsappSockets[whatsappId];
        }
      }
    });
  });
};

async function startSession(whatsappId: string, socket: any) {
  console.log(`Creating new session for ${whatsappId}`);
  whatsappSessions[whatsappId] = { client: null, status: 'creating', qr: null };

  try {
    // Create sessions directory
    const sessionsPath = path.join(process.cwd(), 'simple-sessions');
    if (!fs.existsSync(sessionsPath)) {
      fs.mkdirSync(sessionsPath, { recursive: true });
    }

    // Clean up existing session data
    const sessionPath = path.join(sessionsPath, whatsappId);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    // Use EXACT configuration from working setup
    const client = await create({
      session: whatsappId,
      catchQR: (qrCode: string, asciiQR: string, attempts: number) => {
        console.log(`QR code for ${whatsappId}, attempt ${attempts}`);
        whatsappSessions[whatsappId].qr = qrCode;
        whatsappSessions[whatsappId].status = 'qr';
        socket.emit('whatsapp_qr', { qrCode, attempts });
      },
      statusFind: (status: string, session: string) => {
        console.log(`Status for ${session}: ${status}`);
        whatsappSessions[whatsappId].status = status;
        socket.emit('whatsapp_status', { status });
      },
      headless: true,
      logQR: false,
      browserArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
      puppeteerOptions: { 
        userDataDir: sessionPath
      }
    });

    console.log(`Session created successfully for ${whatsappId}`);
    whatsappSessions[whatsappId].client = client;
    whatsappSessions[whatsappId].status = 'connected';
    
    // Setup client event listeners
    client.onStateChange((state: any) => {
      console.log(`State change for ${whatsappId}: ${state}`);
      if (whatsappSessions[whatsappId]) {
        whatsappSessions[whatsappId].status = state;
      }
      const socketId = whatsappSockets[whatsappId];
      if (socketId) {
        io.to(socketId).emit('whatsapp_status', { status: state });
      }
      if (['CONFLICT', 'UNPAIRED', 'UNLAUNCHED'].includes(state)) {
        client.close();
        delete whatsappSessions[whatsappId];
      }
    });

    socket.emit('whatsapp_status', { status: 'connected' });

  } catch (err: any) {
    console.error(`Error creating session for ${whatsappId}:`, err);
    delete whatsappSessions[whatsappId];
    socket.emit('whatsapp_error', { error: 'Failed to create session: ' + err.message });
  }
}

export default router;