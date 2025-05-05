const functions = require('firebase-functions/v2');
const { logger } = functions;

// Define runtime options if needed (e.g., region, memory)
const runtimeOpts = {
  // region: 'us-central1', // Specify region if desired
  // memory: '128MB'
};

/**
 * HTTP Function to receive and log events from the client-side application.
 * Expects a POST request with a JSON body like:
 * { 
 *   severity: 'INFO' | 'WARNING' | 'ERROR', 
 *   message: 'Descriptive log message',
 *   payload: { ...any additional structured data... }
 * }
 */
exports.logClientEvent = functions.https.onRequest(runtimeOpts, (request, response) => {
  // Enable CORS for requests from your Firebase Hosting domain
  // Replace 'YOUR_FIREBASE_HOSTING_URL' with your actual domain
  // e.g., 'https://your-project-id.web.app'
  // It's recommended to be more specific than '*' in production
  response.set('Access-Control-Allow-Origin', '*'); // <-- TODO: Replace with your actual domain
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Respond to preflight CORS requests
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    response.status(405).send('Method Not Allowed');
    return;
  }

  // Validate request body
  if (!request.body || typeof request.body !== 'object') {
      logger.warn("logClientEvent: Received invalid request body type.", { body: request.body });
      response.status(400).send('Invalid request body: Expected JSON object.');
      return;
  }

  const { severity = 'INFO', message = 'Missing client log message', payload = {} } = request.body;

  // Map severity string to logger methods (case-insensitive)
  const logSeverity = severity.toUpperCase();
  let logFn = logger.info; // Default to info

  switch (logSeverity) {
    case 'DEBUG':
      logFn = logger.debug;
      break;
    case 'INFO':
      logFn = logger.info;
      break;
    case 'WARNING':
    case 'WARN':
      logFn = logger.warn;
      break;
    case 'ERROR':
      logFn = logger.error;
      break;
    case 'CRITICAL':
      logFn = logger.critical;
      break;
    default:
      logger.warn(`logClientEvent: Received unknown severity level '${severity}'. Defaulting to INFO.`);
      logFn = logger.info;
  }

  // Construct the log entry
  const logEntry = {
    clientMessage: message,
    clientPayload: payload,
    clientIp: request.ip, // Automatically captured by Cloud Functions
    // Potentially add authenticated user info if you pass an ID token and verify it
    // authUid: verifiedUserId // Example if you implement token verification
  };

  // Log the structured data received from the client
  logFn('Client Event:', logEntry);

  // Respond to the client
  response.status(200).send({ success: true });
}); 