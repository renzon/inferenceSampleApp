# Roboflow inferencejs sample app (realtime video processing)

## How to run

* add your Roboflow API key to the `.env` file
* Optional: change `ROBOFLOW_SERVER_URL` to a different server url
* `npm ci && npm run dev`
* Open http://localhost:3000


## Architecture

```
Browser                    Your Server                 Roboflow API
┌─────────┐               ┌──────────┐               ┌──────────┐
│         │   WebRTC      │          │   WebRTC      │          │
│ Client  │◄─────────────►│  Proxy   │◄─────────────►│ Serverless│
│         │   Offer       │          │   + API Key   │          │
└─────────┘               └──────────┘               └──────────┘
```

## Project Structure

```
sampleApp/
├── server.js              # Express backend with /api/init-webrtc proxy
├── vite.config.js         # Vite build configuration
├── package.json           # Dependencies and scripts
├── .env                   # Your API key (create from .env.example)
├── .env.example           # Template for environment variables
├── .gitignore             # Git ignore rules
├── src/
│   ├── index.html         # Frontend UI
│   └── app.js             # Frontend logic (imports from npm)
└── public/                # Built frontend (auto-generated)
```

## API Endpoints

### `POST /api/init-webrtc`

Proxies WebRTC initialization to Roboflow.

**Request:**
```json
{
  "offer": {
    "sdp": "...",
    "type": "offer"
  },
  "wrtcparams": {
    "workflowSpec": { ... },
    "imageInputName": "image",
    "streamOutputNames": ["output_image"]
  }
}
```

**Response:**
```json
{
  "sdp": "...",
  "type": "answer",
  "context": {
    "pipeline_id": "abc123",
    "request_id": "xyz789"
  }
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "apiKeyConfigured": true,
  "message": "Server is ready"
}
```

