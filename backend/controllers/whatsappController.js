import whatsappService from '../services/whatsappService.js';

// GET /api/whatsapp/status (Admin Only)
export const getStatus = (req, res) => {
  try {
    const status = whatsappService.getStatus();
    return res.status(200).json(status);
  } catch (err) {
    console.error('Error getting WhatsApp status:', err);
    return res.status(500).json({ error: 'Internal server error getting status' });
  }
};

// POST /api/whatsapp/connect (Admin Only)
export const connect = (req, res) => {
  try {
    whatsappService.initialize();
    const status = whatsappService.getStatus();
    return res.status(200).json({
      message: 'WhatsApp initialization sequence started',
      status
    });
  } catch (err) {
    console.error('Error starting WhatsApp connection:', err);
    return res.status(500).json({ error: 'Internal server error starting connection' });
  }
};

// POST /api/whatsapp/disconnect (Admin Only)
export const disconnect = async (req, res) => {
  try {
    await whatsappService.disconnect();
    return res.status(200).json({
      message: 'WhatsApp client disconnected successfully',
      status: whatsappService.getStatus()
    });
  } catch (err) {
    console.error('Error disconnecting WhatsApp client:', err);
    return res.status(500).json({ error: 'Internal server error disconnecting client' });
  }
};

// POST /api/whatsapp/send-test (Admin Only)
export const sendTestMessage = async (req, res) => {
  const { recipient, message } = req.body;

  if (!recipient || !message) {
    return res.status(400).json({ error: 'Recipient phone number/JID and message body are required' });
  }

  try {
    const response = await whatsappService.sendMessage(recipient, message);
    return res.status(200).json({
      message: 'Test message sent successfully',
      responseId: response.id
    });
  } catch (err) {
    console.error('Error sending test message:', err);
    return res.status(500).json({ error: `Failed to send test message: ${err.message}` });
  }
};
