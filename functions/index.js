/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// const {onRequest} = require("firebase-functions/v2/https");
// const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = functions;
admin.initializeApp();

// Import user profile functions
const userProfileFunctions = require('./userProfileFunctions');

// Import team functions
const teamFunctions = require('./teamFunctions');

// Import task functions
const taskFunctions = require('./taskFunctions');

// Import the new client logging function
const clientLogging = require('./logClientEvent');

// Export user profile functions
exports.getUserProfile = userProfileFunctions.getUserProfile;
exports.updateUserProfile = userProfileFunctions.updateUserProfile;
exports.updateUserAvatar = userProfileFunctions.updateUserAvatar;

// Export team functions
exports.createTeam = teamFunctions.createTeam;
exports.disbandTeam = teamFunctions.disbandTeam;
exports.addTeamMember = teamFunctions.addTeamMember;
exports.removeTeamMember = teamFunctions.removeTeamMember;
exports.updateTeamMemberRole = teamFunctions.updateTeamMemberRole;
exports.searchUsers = teamFunctions.searchUsers;
exports.checkIsTeamAdmin = teamFunctions.checkIsTeamAdmin;
exports.checkIsTeamManager = teamFunctions.checkIsTeamManager;
exports.updateTeam = teamFunctions.updateTeam;

// Export task functions
exports.createTask = taskFunctions.createTask;
exports.updateTask = taskFunctions.updateTask;
exports.deleteTask = taskFunctions.deleteTask;

// Export the new logging function
exports.logClientEvent = clientLogging.logClientEvent;

// --- Add the new simple scaling test function --- 
/**
 * A simple HTTP endpoint for load testing scaling.
 * Requires no authentication, body, or specific headers.
 * Responds to GET requests with a simple message.
 */
exports.helloScalingTest = functions.https.onRequest((request, response) => {
  // Log the request minimally for verification during testing
  logger.log("helloScalingTest function invoked", { method: request.method, path: request.path });

  // Just send a simple success response
  response.status(200).send("Hello from Scaling Test Function!");
});
// --- End of new function ---

// send notification
exports.sendNotification = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send notifications.'
    );
  }

  // verify request data
  if (!request.data.userId || !request.data.title || !request.data.message || !request.data.type) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Notification details are required.'
    );
  }

  try {
    // create notification
    await admin.firestore().collection('notifications').add({
      userId: request.data.userId,
      title: request.data.title,
      message: request.data.message,
      type: request.data.type,
      teamId: request.data.teamId || null,
      teamName: request.data.teamName || null,
      taskId: request.data.taskId || null,
      taskName: request.data.taskName || null,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error("Error sending notification:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send notification. Please try again.'
    );
  }
});

// get unread notifications count
exports.getUnreadNotificationsCount = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to get notifications count.'
    );
  }

  try {
    const userId = request.auth.uid;
    
    // query unread notifications
    const querySnapshot = await admin.firestore().collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();
    
    return { count: querySnapshot.size };
  } catch (error) {
    console.error("Error getting unread notifications count:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to get notifications count. Please try again.'
    );
  }
});

// mark notification as read
exports.markNotificationAsRead = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to mark notifications as read.'
    );
  }

  // verify request data
  if (!request.data.notificationId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Notification ID is required.'
    );
  }

  try {
    const userId = request.auth.uid;
    
    // get notification document
    const notificationRef = admin.firestore().collection('notifications').doc(request.data.notificationId);
    const notificationDoc = await notificationRef.get();
    
    if (!notificationDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Notification not found.'
      );
    }
    
    // verify if notification belongs to current user
    if (notificationDoc.data().userId !== userId) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have permission to mark this notification as read.'
      );
    }
    
    // mark as read
    await notificationRef.update({
      read: true,
      readAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to mark notification as read. Please try again.'
    );
  }
});

// mark all notifications as read
exports.markAllNotificationsAsRead = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to mark notifications as read.'
    );
  }

  try {
    const userId = request.auth.uid;
    
    // get all unread notifications of current user
    const notificationsSnapshot = await admin.firestore().collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();
    
    // batch update notifications
    const batch = admin.firestore().batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    notificationsSnapshot.forEach(doc => {
      batch.update(doc.ref, { 
        read: true,
        readAt: now
      });
    });
    
    await batch.commit();
    
    return { 
      success: true,
      count: notificationsSnapshot.size
    };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to mark all notifications as read. Please try again.'
    );
  }
});

exports.updateUnreadNotifications = onDocumentUpdated('notifications/{notificationId}', async (event) => {
  // get notification data
  const notification = event.data.after.data();
  
  // if there is no notification data or read status is not changed, do not process
  if (!notification || (event.data.before && event.data.before.data().read === notification.read)) {
    return null;
  }

  // get user ID
  const userId = notification.userId;
  
  try {
    // calculate unread notifications count
    const snapshot = await admin.firestore().collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .get();
    
    const unreadCount = snapshot.size;
    
    // update user profile, record unread notifications count
    await admin.firestore().collection('users').doc(userId).update({
      unreadNotifications: unreadCount
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error updating unread notifications count:', error);
    return { error: error.message };
  }
});
