/**
 * Roboflow WebRTC Secure Streaming - Frontend
 *
 * This example uses connectors.withProxyUrl() to keep your API key secure.
 * All communication with Roboflow is proxied through the backend server.
 */

import { connectors, webrtc, streams } from '@roboflow/inference-sdk';

// Get DOM elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const statusEl = document.getElementById("status");
const videoEl = document.getElementById("video");
const videoContainer = document.getElementById("videoContainer");

// Track active connection
let activeConnection = null;

// Load workflow specification from JSON file
let WORKFLOW_SPEC = null;

async function loadWorkflowSpec() {
  if (WORKFLOW_SPEC) {
    return WORKFLOW_SPEC;
  }

  try {
    const response = await fetch('/back_squat_workflow.json');
    if (!response.ok) {
      throw new Error(`Failed to load workflow: ${response.status} ${response.statusText}`);
    }
    WORKFLOW_SPEC = await response.json();
    console.log('[UI] Workflow loaded successfully');
    return WORKFLOW_SPEC;
  } catch (error) {
    console.error('[UI] Failed to load workflow:', error);
    throw error;
  }
}

/**
 * Get TURN server credentials from backend
 *
 * Fetches dynamic TURN credentials from Roboflow API via backend proxy.
 * These credentials allow WebRTC connections to work behind NAT/firewalls.
 *
 * @returns {Promise<Object>} ICE server configuration with TURN credentials
 */
async function getTurnCredentials() {
  try {
    console.log('[UI] Fetching TURN credentials...');

    const response = await fetch('/api/webrtc_turn_config');

    if (!response.ok) {
      throw new Error(`Failed to fetch TURN config: ${response.status} ${response.statusText}`);
    }

    const turnConfig = await response.json();

    console.log('[UI] Raw TURN config from API:', turnConfig);

    // Validate that we have the required fields
    if (!turnConfig.urls) {
      console.error('[UI] Invalid TURN config: missing urls field');
      return null;
    }

    if (!turnConfig.username || !turnConfig.credential) {
      console.error('[UI] Invalid TURN config: missing username or credential');
      return null;
    }

    // RTCIceServer requires 'urls' to be an array of strings
    // The API might return it as a string or array, so normalize it
    const urls = Array.isArray(turnConfig.urls) ? turnConfig.urls : [turnConfig.urls];

    // IMPORTANT: Only include valid RTCIceServer fields (urls, username, credential)
    // Do NOT include extra fields like 'ttl' as they will cause "Malformed RTCIceServer" error
    const iceServer = {
      urls: urls,
      username: turnConfig.username,
      credential: turnConfig.credential
    };

    console.log('[UI] Converted ICE server config:', iceServer);

    return iceServer;

  } catch (error) {
    console.error('[UI] Failed to fetch TURN credentials:', error);
    // Return null if TURN fetch fails - connection will fall back to STUN only
    return null;
  }
}

/**
 * Update status display
 */
function setStatus(text) {
  statusEl.textContent = text;
  console.log("[UI Status]", text);
}

/**
 * Connect to Roboflow WebRTC streaming using secure proxy
 *
 * @param {Object} options - Connection options
 * @param {Object} [options.workflowSpec] - Workflow specification
 * @param {Function} [options.onData] - Callback for data channel messages
 * @returns {Promise<RFWebRTCConnection>} WebRTC connection object
 */
async function connectWebcamToRoboflowWebRTC(options = {}) {
  // Load workflow spec if not provided
  const workflowSpec = options.workflowSpec || await loadWorkflowSpec();
  const onData = options.onData;

  // Fetch TURN credentials for NAT traversal
  const turnServer = await getTurnCredentials();

  // Build ICE servers configuration
  const iceServers = [
    // Google's public STUN server (for basic NAT traversal)
    { urls: ["stun:stun.l.google.com:19302"] }
  ];

  // Add TURN server if credentials were fetched successfully
  if (turnServer) {
    iceServers.push(turnServer);
    console.log('[UI] Using TURN server for enhanced NAT traversal');
  } else {
    console.warn('[UI] TURN server unavailable, using STUN only');
  }

  console.log('[UI] Final ICE servers configuration:', iceServers);

  // Create connector that uses backend proxy (keeps API key secure)
  const connector = connectors.withProxyUrl('/api/init-webrtc');

  // Establish WebRTC connection
  const connection = await webrtc.useStream({
    source: await streams.useCamera({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    }),
    connector: connector,
    wrtcParams: {
      workflowSpec: workflowSpec,

      // workspaceName: "renzo-sandbox",
      // workflowId: "squat-detector-workflow-yt",
      imageInputName: "image",
      streamOutputNames: ["bounding_box_visualization"],
      dataOutputNames: ["squat_predictions"],

      // ICE servers for WebRTC NAT traversal (STUN + TURN)
      iceServers: iceServers
    },
    onData: onData,
    options: {
      disableInputStreamDownscaling: true
    }
  });

  return connection;
}

/**
 * Start WebRTC streaming with Roboflow
 */
async function start() {
  if (activeConnection) {
    console.warn("Already connected");
    return;
  }

  // Disable start button while connecting
  startBtn.disabled = true;
  setStatus("Connecting...");

  try {
    // Connect to Roboflow via backend proxy
    const connection = await connectWebcamToRoboflowWebRTC({
      onData: (data) => {
        console.log("[Data]", data);
      }
    });

    activeConnection = connection;

    // Get and display the processed video stream
    const remoteStream = await connection.remoteStream();
    videoEl.srcObject = remoteStream;
    videoEl.controls = false;

    // Ensure video plays
    try {
      await videoEl.play();
      console.log("[UI] Video playing");
    } catch (err) {
      console.warn("[UI] Autoplay failed:", err);
    }

    // Update UI
    setStatus("Connected - Processing video");
    stopBtn.disabled = false;

    console.log("[UI] Successfully connected!");

  } catch (err) {
    console.error("[UI] Connection failed:", err);

    // Handle specific errors
    if (err.message.includes('API key')) {
      setStatus("Error: Server API key not configured");
      alert("Server configuration error. Please check that ROBOFLOW_API_KEY is set in the .env file.");
    } else {
      setStatus(`Error: ${err.message}`);
    }

    startBtn.disabled = false;
    activeConnection = null;
  }
}

/**
 * Stop video processing and cleanup
 */
async function stop() {
  if (!activeConnection) {
    return;
  }

  stopBtn.disabled = true;
  setStatus("Stopping...");

  try {
    await activeConnection.cleanup();
    console.log("[UI] Cleanup complete");
  } catch (err) {
    console.error("[UI] Cleanup error:", err);
  } finally {
    // Reset UI
    activeConnection = null;
    videoEl.srcObject = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    setStatus("Idle");
  }
}

/**
 * Toggle fullscreen mode
 */
async function toggleFullscreen() {
  try {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    
    if (!isFullscreen) {
      // Enter fullscreen
      console.log('[UI] Attempting to enter fullscreen...');
      
      // Try standard API first
      if (videoContainer.requestFullscreen) {
        await videoContainer.requestFullscreen({ navigationUI: 'hide' });
        console.log('[UI] Entered fullscreen (standard API)');
        return;
      }
      
      // Fallback to vendor prefixes
      if (videoContainer.webkitRequestFullscreen) {
        await videoContainer.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        console.log('[UI] Entered fullscreen (webkit)');
        return;
      }
      
      if (videoContainer.mozRequestFullScreen) {
        await videoContainer.mozRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
        console.log('[UI] Entered fullscreen (moz)');
        return;
      }
      
      if (videoContainer.msRequestFullscreen) {
        await videoContainer.msRequestFullscreen();
        console.log('[UI] Entered fullscreen (ms)');
        return;
      }
      
      console.error('[UI] Fullscreen API not supported in this browser');
      alert('Fullscreen is not supported in this browser');
    } else {
      // Exit fullscreen
      console.log('[UI] Attempting to exit fullscreen...');
      
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
      
      console.log('[UI] Exited fullscreen');
    }
  } catch (error) {
    console.error('[UI] Fullscreen error:', error);
    // Show user-friendly error message
    if (error.name === 'NotAllowedError') {
      alert('Fullscreen was denied. Please allow fullscreen permissions and try again.');
    } else if (error.name === 'TypeError') {
      console.warn('[UI] Fullscreen API may not be available (possibly in iframe)');
      // Try alternative: make video element fullscreen
      try {
        if (videoEl.requestFullscreen) {
          await videoEl.requestFullscreen({ navigationUI: 'hide' });
        } else if (videoEl.webkitRequestFullscreen) {
          await videoEl.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
      } catch (videoError) {
        console.error('[UI] Video element fullscreen also failed:', videoError);
        alert('Unable to enter fullscreen. This may be due to browser restrictions or iframe limitations.');
      }
    } else {
      alert('An error occurred while trying to toggle fullscreen: ' + error.message);
    }
  }
}

/**
 * Update fullscreen button text based on fullscreen state
 */
function updateFullscreenButton() {
  const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  fullscreenBtn.textContent = isFullscreen ? "⛶ Exit Fullscreen" : "⛶ Fullscreen";
  videoContainer.classList.toggle("fullscreen", isFullscreen);
}

// Attach event listeners
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
fullscreenBtn.addEventListener("click", toggleFullscreen);

// Listen for fullscreen changes
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
document.addEventListener("mozfullscreenchange", updateFullscreenButton);
document.addEventListener("MSFullscreenChange", updateFullscreenButton);

// Cleanup on page unload
window.addEventListener("pagehide", () => {
  if (activeConnection) {
    activeConnection.cleanup();
  }
});

window.addEventListener("beforeunload", () => {
  if (activeConnection) {
    activeConnection.cleanup();
  }
});

// Check fullscreen API availability on load
function checkFullscreenSupport() {
  const support = {
    standard: !!videoContainer.requestFullscreen,
    webkit: !!videoContainer.webkitRequestFullscreen,
    moz: !!videoContainer.mozRequestFullScreen,
    ms: !!videoContainer.msRequestFullscreen,
    available: !!(videoContainer.requestFullscreen || videoContainer.webkitRequestFullscreen || 
                   videoContainer.mozRequestFullScreen || videoContainer.msRequestFullscreen)
  };
  
  console.log('[UI] Fullscreen API support:', support);
  
  if (!support.available) {
    console.warn('[UI] Fullscreen API not supported - button may not work');
    fullscreenBtn.disabled = true;
    fullscreenBtn.title = 'Fullscreen not supported in this browser';
  }
}

// Check server health on load
fetch('/api/health')
  .then(res => res.json())
  .then(data => {
    console.log('[UI] Server health:', data);
    if (!data.apiKeyConfigured) {
      console.warn('[UI] Warning: Server API key not configured');
    }
  })
  .catch(err => {
    console.error('[UI] Failed to check server health:', err);
  });

// Check fullscreen support on load
checkFullscreenSupport();
