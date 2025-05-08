import { getAuth } from 'firebase/auth';

// IMPORTANT: Replace this placeholder with your actual Cloud Function URL!
// You can find this URL in the Firebase Console (Functions section) after deploying the 'logClientEvent' function.
// It typically looks like: https://<YOUR_REGION>-<YOUR_PROJECT_ID>.cloudfunctions.net/logClientEvent
// Consider using environment variables for this in a real application (e.g., process.env.REACT_APP_LOG_FUNCTION_URL)
const logClientEventUrl = 'https://us-central1-sample-a9153.cloudfunctions.net/logClientEvent'; // <-- REPLACE THIS

/**
 * Sends a log entry to the backend logging Cloud Function.
 *
 * @param {'INFO' | 'WARN' | 'ERROR' | 'DEBUG'} severity The severity level. Case-insensitive.
 * @param {string} message The log message.
 * @param {object} [payload={}] Additional structured data to log.
 */
export const logToServer = async (severity, message, payload = {}) => {
  if (!logClientEventUrl || logClientEventUrl === 'YOUR_LOG_CLIENT_EVENT_FUNCTION_URL_HERE') {
    console.error('Logging Error: logClientEventUrl is not configured in src/utils/logger.js');
    return; // Don't attempt to send if URL is not set
  }

  try {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    // No need to send ID token unless your logging function verifies it,
    // which the current implementation does not require.

    // Include standard client-side context
    const logPayload = {
      ...payload, // Include any custom data passed in
      clientTimestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      userId: currentUser ? currentUser.uid : 'anonymous', // Add Firebase Auth UID if available
      userEmail: currentUser ? currentUser.email : 'anonymous' // Add email if available
    };

    const body = JSON.stringify({
      // Ensure severity is uppercase as the backend function expects it
      severity: severity.toUpperCase(),
      message,
      payload: logPayload,
    });

    // Use the fetch API to send the log data via POST request
    const response = await fetch(logClientEventUrl, {
      method: 'POST',
      headers: {
        // Let the browser set Content-Type for application/json
         'Content-Type': 'application/json',
        // No Authorization header needed unless your function verifies tokens
      },
      body: body,
    });

    // Optional: Check if the logging request itself failed (network error, function error)
    if (!response.ok) {
        // Log locally if sending failed, but be careful not to cause infinite loops
        console.error('Failed to send log to server:', {
            status: response.status,
            statusText: response.statusText,
            url: logClientEventUrl,
            requestBody: body // Log what was attempted to be sent
        });
        try {
            const errorBody = await response.text();
            console.error('Server response body:', errorBody);
        } catch (e) {
             console.error('Could not read error response body');
        }
    }
    // We generally don't need to process the response from the logging function ('{ success: true }')

  } catch (error) {
    // Log locally if the fetch call itself throws an error (e.g., network issue)
    // Avoid infinite loops if console.error also tries to logToServer
    console.error('Error sending log to server via fetch:', error);
  }
};

// You can create helper functions for specific severities
export const logInfo = (message, payload) => logToServer('INFO', message, payload);
export const logWarn = (message, payload) => logToServer('WARN', message, payload);
export const logError = (message, payload) => logToServer('ERROR', message, payload); 