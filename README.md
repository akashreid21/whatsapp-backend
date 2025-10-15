# WhatsApp Backend Service

Backend service for Akashi WhatsApp project. Handles WhatsApp Web connection and task extraction.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run the server:
```bash
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

- `GET /` - Health check
- `POST /api/whatsapp/connect` - Initialize WhatsApp connection
- `GET /api/whatsapp/connect` - Get connection status
- `GET /api/whatsapp/qr` - Get QR code for authentication
- `GET /api/tasks` - Get all tasks
- `PATCH /api/tasks/:id` - Update task status
- `DELETE /api/tasks/:id` - Delete a task

## Deployment to Render

See deployment guide in main project README.
