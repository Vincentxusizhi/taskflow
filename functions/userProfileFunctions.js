const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');



// Get user profile data including teams and tasks
// Use functions.https.onCall with appropriate options if needed, e.g., region
exports.getUserProfile = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request' for v2 onCall
  try {
    // Ensure user is authenticated (v2 uses request.auth)
    if (!request.auth) { // <-- Use request.auth for v2 onCall
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to fetch user profile'
      );
    }
    console.log('Authenticated user:', request.auth.uid); // <-- Use request.auth.uid

    // Data is accessed via request.data
    const userId = request.data.userId; // <-- Use request.data
    if (!userId) {
       throw new functions.https.HttpsError(
        'invalid-argument',
        'The function must be called with a "userId" argument.'
      );
    }

    // Get user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
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

    return {
      user: userData,
      teams: teamsData,
      tasks: userTasks
    };
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    // Check if it's already an HttpsError, otherwise wrap it
    if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Update user profile information
exports.updateUserProfile = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request'
  try {
    // Ensure user is authenticated
    if (!request.auth) { // <-- Use request.auth
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to update profile'
      );
    }

    const { userId, profileData } = request.data; // <-- Use request.data
     if (!userId || !profileData) {
       throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing userId or profileData in request.'
      );
    }


    // Security check - users can only update their own profile
    if (request.auth.uid !== userId) { // <-- Use request.auth.uid
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only update your own profile'
      );
    }

    // Update Firestore user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    await userRef.update({
      displayName: profileData.displayName,
      email: profileData.email,
      bio: profileData.bio,
      role: profileData.role,
      phoneNumber: profileData.phoneNumber,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: 'Profile updated successfully' };
  } catch (error) {
    console.error('Error in updateUserProfile:', error);
     if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Update user avatar
exports.updateUserAvatar = functions.https.onCall(async (request) => { // Changed 'data, context' to 'request'
  try {
    // Ensure user is authenticated
    if (!request.auth) { // <-- Use request.auth
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to update avatar'
      );
    }

    const { userId, photoURL } = request.data; // <-- Use request.data
     if (!userId || !photoURL) {
       throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing userId or photoURL in request.'
      );
    }

    // Security check - users can only update their own avatar
    if (request.auth.uid !== userId) { // <-- Use request.auth.uid
      throw new functions.https.HttpsError(
        'permission-denied',
        'You can only update your own avatar'
      );
    }

    // Update Firestore user document
    const userRef = admin.firestore().doc(`users/${userId}`);
    await userRef.update({
      photoURL: photoURL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() // Good practice to update timestamp
    });

    return { success: true, message: 'Avatar updated successfully' };
  } catch (error) {
    console.error('Error in updateUserAvatar:', error);
     if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});