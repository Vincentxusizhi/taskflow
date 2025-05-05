const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { logger } = functions; // <-- Import the logger

// Get user profile data including teams and tasks
// Use functions.https.onCall with appropriate options if needed, e.g., region
exports.getUserProfile = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request' for v2 onCall
  // Log the start of the function execution with structured context
  logger.info("getUserProfile started", {
    auth: request.auth ? { uid: request.auth.uid } : null, // Log auth UID if present
    requestData: request.data // Log the incoming request data
  });

  try {
    // Ensure user is authenticated (v2 uses request.auth)
    if (!request.auth) { // <-- Use request.auth for v2 onCall
      // Log the specific error before throwing
      logger.warn("getUserProfile: Unauthenticated access attempt.", { ip: request.ip });
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to fetch user profile'
      );
    }
    // console.log('Authenticated user:', request.auth.uid); // <-- Replaced by logger.info above

    // Data is accessed via request.data
    const userId = request.data.userId; // <-- Use request.data
    if (!userId) {
       logger.warn("getUserProfile: Missing userId argument.", { authUid: request.auth.uid });
       throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with a "userId" argument.'
      );
    }

    logger.log("Fetching user profile", { targetUserId: userId, requesterUid: request.auth.uid });

    // Get user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      logger.warn("getUserProfile: User not found.", { targetUserId: userId });
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = {
      id: userSnap.id,
      ...userSnap.data()
    };

    // Get user teams
    const teamsQuery = await admin.firestore()
      .collection('teams')
      .where('members', 'array-contains', userId)
      .get();

    const teamsData = [];
    teamsQuery.forEach((doc) => {
      teamsData.push({
        id: doc.id,
        ...doc.data()
      });
    });

    // Get user tasks
    const userTasks = [];
    for (const team of teamsData) {
      if (team.tasks && Array.isArray(team.tasks)) {
        const assignedTasks = team.tasks.filter(task =>
          task.assignees && task.assignees.some(assignee => assignee.uid === userId)
        );

        if (assignedTasks.length > 0) {
          userTasks.push(...assignedTasks.map(task => ({
            ...task,
            teamId: team.id,
            teamName: team.name
          })));
        }
      }
    }

    logger.info("getUserProfile succeeded", { targetUserId: userId, requesterUid: request.auth.uid, teamCount: teamsData.length, taskCount: userTasks.length });

    return {
      user: userData,
      teams: teamsData,
      tasks: userTasks
    };
  } catch (error) {
    // Log the error with structured details
    logger.error("Error in getUserProfile", {
      auth: request.auth ? { uid: request.auth.uid } : null,
      targetUserId: request.data?.userId, // Safely access potentially missing data
      errorMessage: error.message,
      errorStack: error.stack,
      // Include HttpsError specific details if available
      errorCode: error.code,
      errorDetails: error.details,
    });
    // console.error('Error in getUserProfile:', error); // <-- Replaced by logger.error

    // Re-throw the error (keeping existing logic)
    if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Update user profile information
exports.updateUserProfile = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request'
   logger.info("updateUserProfile started", {
    auth: request.auth ? { uid: request.auth.uid } : null,
    requestData: request.data
  });

  try {
    // Ensure user is authenticated
    if (!request.auth) { // <-- Use request.auth
       logger.warn("updateUserProfile: Unauthenticated access attempt.", { ip: request.ip });
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to update profile'
      );
    }

    const { userId, profileData } = request.data; // <-- Use request.data
     if (!userId || !profileData) {
       logger.warn("updateUserProfile: Missing userId or profileData.", { authUid: request.auth.uid });
       throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing userId or profileData in request.'
      );
    }

    // Security check - users can only update their own profile
    if (request.auth.uid !== userId) { // <-- Use request.auth.uid
      logger.error("updateUserProfile: Permission denied.", {
          requesterUid: request.auth.uid,
          targetUserId: userId,
      });
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only update your own profile'
      );
    }

    logger.log("Updating user profile", { targetUserId: userId, requesterUid: request.auth.uid });

    // Update Firestore user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    await userRef.update({
      // Only include fields present in profileData to avoid overwriting with undefined
      ...(profileData.displayName !== undefined && { displayName: profileData.displayName }),
      ...(profileData.email !== undefined && { email: profileData.email }),
      ...(profileData.bio !== undefined && { bio: profileData.bio }),
      ...(profileData.role !== undefined && { role: profileData.role }),
      ...(profileData.phoneNumber !== undefined && { phoneNumber: profileData.phoneNumber }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info("updateUserProfile succeeded", { targetUserId: userId, requesterUid: request.auth.uid });

    return { success: true, message: 'Profile updated successfully' };
  } catch (error) {
     logger.error("Error in updateUserProfile", {
        auth: request.auth ? { uid: request.auth.uid } : null,
        targetUserId: request.data?.userId,
        errorMessage: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        errorDetails: error.details,
     });
    // console.error('Error in updateUserProfile:', error); // <-- Replaced by logger.error

    if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Update user avatar
exports.updateUserAvatar = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request'
  logger.info("updateUserAvatar started", {
    auth: request.auth ? { uid: request.auth.uid } : null,
    requestData: request.data
  });

  try {
    // Ensure user is authenticated
    if (!request.auth) { // <-- Use request.auth
       logger.warn("updateUserAvatar: Unauthenticated access attempt.", { ip: request.ip });
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to update avatar'
      );
    }

    const { userId, photoURL } = request.data; // <-- Use request.data
     if (!userId || !photoURL) {
       logger.warn("updateUserAvatar: Missing userId or photoURL.", { authUid: request.auth.uid });
       throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing userId or photoURL in request.'
      );
    }

    // Security check - users can only update their own avatar
    if (request.auth.uid !== userId) { // <-- Use request.auth.uid
       logger.error("updateUserAvatar: Permission denied.", {
          requesterUid: request.auth.uid,
          targetUserId: userId,
      });
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only update your own avatar'
      );
    }

    logger.log("Updating user avatar", { targetUserId: userId, requesterUid: request.auth.uid });

    // Update Firestore user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    await userRef.update({
      photoURL: photoURL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() // Good practice to update timestamp
    });

    logger.info("updateUserAvatar succeeded", { targetUserId: userId, requesterUid: request.auth.uid });

    return { success: true, message: 'Avatar updated successfully' };
  } catch (error) {
    logger.error("Error in updateUserAvatar", {
        auth: request.auth ? { uid: request.auth.uid } : null,
        targetUserId: request.data?.userId,
        photoURLProvided: !!request.data?.photoURL, // Log if URL was provided
        errorMessage: error.message,
        errorStack: error.stack,
        errorCode: error.code,
        errorDetails: error.details,
     });
    // console.error('Error in updateUserAvatar:', error); // <-- Replaced by logger.error

    if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});