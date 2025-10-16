const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// WhatsApp client setup
let client = null;
let isReady = false;
let isInitializing = false;
let latestQR = '';
let latestQRImage = '';
let tasks = [];

// Task extraction keywords
const SCHEDULING_KEYWORDS = ['schedule', 'interview', 'meeting', 'appointment', 'slot', 'available', 'when can', 'time', 'date', 'reschedule'];
const FOLLOWUP_KEYWORDS = ['follow up', 'update', 'status', 'any news', 'heard back', 'progress', 'waiting', 'pending', 'check'];
const STATUSUPDATE_KEYWORDS = ['result', 'outcome', 'feedback', 'decision', 'next step', 'what happened', 'how did', 'passed', 'failed'];

// Task extractor function
function extractTask(message, senderName, senderNumber) {
  const hasQuestion = message.includes('?');
  const lowerMessage = message.toLowerCase();

  const isScheduling = SCHEDULING_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  const isFollowUp = FOLLOWUP_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
  const isStatusUpdate = STATUSUPDATE_KEYWORDS.some(keyword => lowerMessage.includes(keyword));

  if (!hasQuestion && !isScheduling && !isFollowUp && !isStatusUpdate) {
    return null;
  }

  let category = 'general';
  let priority = 'medium';

  if (isScheduling) {
    category = 'scheduling';
    priority = 'high';
  } else if (isFollowUp) {
    category = 'follow-up';
    priority = 'medium';
  } else if (isStatusUpdate) {
    category = 'status-update';
    priority = 'medium';
  }

  let taskDescription = message;
  if (message.length > 100) {
    taskDescription = message.substring(0, 100) + '...';
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    candidateName: senderName,
    candidateNumber: senderNumber,
    taskDescription,
    originalMessage: message,
    timestamp: new Date(),
    priority,
    status: 'new',
    category,
  };
}

// Initialize WhatsApp client
function initializeWhatsAppClient() {
  if (client) {
    console.log('Client already exists');
    return;
  }

  console.log('Creating WhatsApp client...');
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
    },
  });

  // QR Code generation
  client.on('qr', async (qr) => {
    console.log('========================================');
    console.log('QR Code received!');
    console.log('========================================');
    latestQR = qr;

    // Generate QR code as base64 image
    try {
      latestQRImage = await qrcode.toDataURL(qr);
      console.log('QR code image generated successfully');
    } catch (error) {
      console.error('Error generating QR code image:', error);
    }
  });

  // Client ready
  client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isReady = true;
    isInitializing = false;
  });

  // Authentication success
  client.on('authenticated', () => {
    console.log('WhatsApp authenticated successfully');
  });

  // Authentication failure
  client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
    isInitializing = false;
  });

  // Incoming messages
  client.on('message', async (message) => {
    try {
      const contact = await message.getContact();
      const senderName = contact.pushname || contact.name || 'Unknown';
      const senderNumber = contact.number;

      const task = extractTask(message.body, senderName, senderNumber);

      if (task) {
        tasks.push(task);
        console.log('New task detected:', task.taskDescription);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  // Disconnected
  client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    isReady = false;
    isInitializing = false;
    client = null;
    latestQR = '';
    latestQRImage = '';
  });

  // Handle errors
  client.on('error', (error) => {
    console.error('WhatsApp client error:', error);
  });
}

// API Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WhatsApp Backend Service',
    connected: isReady,
    initializing: isInitializing
  });
});

// Connect to WhatsApp
app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    if (isReady) {
      return res.json({
        status: 'already_connected',
        message: 'WhatsApp is already connected'
      });
    }

    if (isInitializing) {
      return res.json({
        status: 'connecting',
        message: 'WhatsApp is already connecting'
      });
    }

    if (!client) {
      initializeWhatsAppClient();
    }

    console.log('Initializing WhatsApp client...');
    isInitializing = true;
    client.initialize();

    res.json({
      status: 'connecting',
      message: 'Connecting to WhatsApp... Check for QR code'
    });
  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
    isInitializing = false;
    res.status(500).json({ error: 'Failed to connect to WhatsApp' });
  }
});

// Get connection status
app.get('/api/whatsapp/connect', (req, res) => {
  res.json({
    connected: isReady,
    initializing: isInitializing
  });
});

// Get QR code
app.get('/api/whatsapp/qr', (req, res) => {
  res.json({
    qr: latestQR,
    qrImage: latestQRImage,
    isInitializing: isInitializing
  });
});

// Get tasks
app.get('/api/tasks', (req, res) => {
  res.json({
    tasks: tasks
  });
});

// Update task status
app.patch('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = status;
    res.json({ success: true, task });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const index = tasks.findIndex(t => t.id === id);

  if (index !== -1) {
    tasks.splice(index, 1);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      console.error('Error destroying client:', error);
    }
  }
  process.exit(0);
});

// Handle uncaught exceptions (prevents crash from WhatsApp logout errors)
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Don't exit process - keep server running
  isReady = false;
  isInitializing = false;
  client = null;
  latestQR = '';
  latestQRImage = '';
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit process - keep server running
});
