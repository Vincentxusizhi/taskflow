const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Helper functions
const isUserTeamAdmin = async (teamId, userId) => {
  try {
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      return false;
    }
    
    const team = teamDoc.data();
    return team.membersData?.some(
      (member) => member.uid === userId && member.role === "admin"
    );
  } catch (error) {
    console.error('Error in isUserTeamAdmin:', error);
    return false;
  }
};

const isUserTeamManager = async (teamId, userId) => {
  try {
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      return false;
    }
    
    const team = teamDoc.data();
    return team.membersData?.some(
      (member) =>
        member.uid === userId &&
        (member.role === "admin" || member.role === "manager")
    );
  } catch (error) {
    console.error('Error in isUserTeamManager:', error);
    return false;
  }
};

// Create a new team
exports.createTeam = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to create a team'
      );
    }

    const { name, members } = request.data;
    if (!name || !name.trim()) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team name is required'
      );
    }

    const userId = request.auth.uid;
    
    // Get user data for the creator
    const userRef = admin.firestore().doc(`users/${userId}`);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'User not found'
      );
    }

    const userData = userDoc.data();
    
    // Add current user as admin
    const currentUser = {
      uid: userId,
      email: userData.email,
      displayName: userData.displayName,
      role: "admin", // Creator is always admin
    };

    // Prepare members data for Firestore
    let membersData = [currentUser];
    
    // Add other members if provided
    if (members && Array.isArray(members) && members.length > 0) {
      membersData = [...membersData, ...members];
    }

    // Create team document
    const teamRef = await admin.firestore().collection('teams').add({
      name: name.trim(),
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      members: membersData.map((member) => member.uid), // Array of user IDs for queries
      membersData: membersData, // Detailed member data including roles
    });

    // Send notification to the creator
    await admin.firestore().collection('notifications').add({
      userId: userId,
      title: "Team Created Successfully",
      message: `You have created team "${name}". Start team work now!`,
      type: "team_created",
      teamId: teamRef.id,
      teamName: name,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notifications to other members
    const invitePromises = membersData
      .filter(member => member.uid !== userId) // Exclude the creator
      .map(member => 
        admin.firestore().collection('notifications').add({
          userId: member.uid,
          title: "Team Invitation",
          message: `You have been invited to join "${name}" by ${userData.displayName || userData.email}`,
          type: "team_invitation",
          teamId: teamRef.id,
          teamName: name,
          invitedBy: {
            uid: userId,
            displayName: userData.displayName,
            email: userData.email
          },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
      );

    await Promise.all(invitePromises);

    return { 
      success: true, 
      teamId: teamRef.id, 
      message: 'Team created successfully' 
    };
  } catch (error) {
    console.error('Error in createTeam:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Disband (delete) a team
exports.disbandTeam = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to disband a team'
      );
    }

    const { teamId } = request.data;
    if (!teamId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID is required'
      );
    }

    // Verify user is an admin of the team
    const isAdmin = await isUserTeamAdmin(teamId, request.auth.uid);
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only team admins can disband a team'
      );
    }

    // Get team data before deletion (for notifications)
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found'
      );
    }
    
    const teamData = teamDoc.data();
    
    // Delete team
    await teamRef.delete();
    
    // Send notifications to all members
    const notificationPromises = teamData.members.map(memberId => 
      admin.firestore().collection('notifications').add({
        userId: memberId,
        title: "Team Disbanded",
        message: `The team "${teamData.name}" has been disbanded.`,
        type: "team_disbanded",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      })
    );
    
    await Promise.all(notificationPromises);
    
    return { success: true, message: 'Team disbanded successfully' };
  } catch (error) {
    console.error('Error in disbandTeam:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Add a new member to a team
exports.addTeamMember = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to add a team member'
      );
    }

    const { teamId, memberData } = request.data;
    if (!teamId || !memberData || !memberData.uid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID and member data are required'
      );
    }

    // Verify user is a manager or admin of the team
    const isManager = await isUserTeamManager(teamId, request.auth.uid);
    if (!isManager) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only team managers or admins can add members'
      );
    }

    // Get current user data for notification
    const currentUserRef = admin.firestore().doc(`users/${request.auth.uid}`);
    const currentUserDoc = await currentUserRef.get();
    
    if (!currentUserDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Current user not found');
    }
    
    const currentUserData = currentUserDoc.data();

    // Get team data
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    
    const teamData = teamDoc.data();

    // Check if user is already a member
    const exists = teamData.members?.includes(memberData.uid);
    if (exists) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This user is already added to the team'
      );
    }

    // Add the new member to the team
    const updatedMembersData = [
      ...(teamData.membersData || []),
      memberData
    ];
    const updatedMembers = updatedMembersData.map((member) => member.uid);

    await teamRef.update({
      members: updatedMembers,
      membersData: updatedMembersData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notification to the new member
    await admin.firestore().collection('notifications').add({
      userId: memberData.uid,
      title: "Team Invitation",
      message: `You have been invited to join "${teamData.name}" by ${currentUserData.displayName || currentUserData.email}`,
      type: "team_invitation",
      teamId: teamId,
      teamName: teamData.name,
      invitedBy: {
        uid: request.auth.uid,
        displayName: currentUserData.displayName,
        email: currentUserData.email
      },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Team member added successfully',
      updatedMembers: updatedMembersData  
    };
  } catch (error) {
    console.error('Error in addTeamMember:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Remove a member from a team
exports.removeTeamMember = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to remove a team member'
      );
    }

    const { teamId, memberId } = request.data;
    if (!teamId || !memberId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID and member ID are required'
      );
    }

    // Verify user is an admin of the team
    const isAdmin = await isUserTeamAdmin(teamId, request.auth.uid);
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only team admins can remove members'
      );
    }

    // Get team data
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    
    const teamData = teamDoc.data();

    // Check if the member being removed is an admin
    const memberToRemove = teamData.membersData?.find(m => m.uid === memberId);
    if (!memberToRemove) {
      throw new functions.https.HttpsError('not-found', 'Member not found in team');
    }
    
    if (memberToRemove.role === 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot remove an admin from the team'
      );
    }

    // Filter out the member to remove
    const updatedMembersData = teamData.membersData.filter(
      (member) => member.uid !== memberId
    );
    const updatedMembers = updatedMembersData.map((member) => member.uid);

    // Update the team document
    await teamRef.update({
      members: updatedMembers,
      membersData: updatedMembersData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notification to the removed member
    await admin.firestore().collection('notifications').add({
      userId: memberId,
      title: "Removed from Team",
      message: `You have been removed from the team "${teamData.name}".`,
      type: "team_removal",
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Team member removed successfully',
      updatedMembers: updatedMembersData
    };
  } catch (error) {
    console.error('Error in removeTeamMember:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Update a team member's role
exports.updateTeamMemberRole = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to update a team member role'
      );
    }

    const { teamId, memberId, newRole } = request.data;
    if (!teamId || !memberId || !newRole) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID, member ID, and new role are required'
      );
    }

    // Verify user is an admin of the team
    const isAdmin = await isUserTeamAdmin(teamId, request.auth.uid);
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only team admins can update member roles'
      );
    }

    // Get team data
    const teamRef = admin.firestore().doc(`teams/${teamId}`);
    const teamDoc = await teamRef.get();
    
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team not found');
    }
    
    const teamData = teamDoc.data();

    // Check if the member exists
    const memberToUpdate = teamData.membersData?.find(m => m.uid === memberId);
    if (!memberToUpdate) {
      throw new functions.https.HttpsError('not-found', 'Member not found in team');
    }
    
    // Check if trying to change an admin's role
    if (memberToUpdate.role === 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot change an admin\'s role'
      );
    }
    
    // Check if trying to set role to admin
    if (newRole === 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Cannot assign admin role to members'
      );
    }

    // Update the member's role
    const updatedMembersData = teamData.membersData.map((member) =>
      member.uid === memberId ? { ...member, role: newRole } : member
    );

    // Update the team document
    await teamRef.update({
      membersData: updatedMembersData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send notification to the member
    await admin.firestore().collection('notifications').add({
      userId: memberId,
      title: "Role Updated",
      message: `Your role in the team "${teamData.name}" has been updated to ${newRole}.`,
      type: "role_update",
      teamId: teamId,
      teamName: teamData.name,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { 
      success: true, 
      message: 'Team member role updated successfully',
      updatedMembers: updatedMembersData
    };
  } catch (error) {
    console.error('Error in updateTeamMemberRole:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Search for users to add to a team
exports.searchUsers = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to search users'
      );
    }

    const { searchText } = request.data;
    if (!searchText || searchText.length < 2) {
      return { results: [] };
    }

    // Get current user ID
    const currentUserId = request.auth.uid;

    // Use a compound query to search by email, displayName, or other relevant fields
    const usersRef = admin.firestore().collection('users');
    
    // Search by email
    const emailQuery = await usersRef
      .where('email', '>=', searchText)
      .where('email', '<=', searchText + '\uf8ff')
      .get();
      
    // Search by displayName
    const nameQuery = await usersRef
      .where('displayName', '>=', searchText)
      .where('displayName', '<=', searchText + '\uf8ff')
      .get();

    // Combine results and remove duplicates
    const usersMap = new Map();

    [...emailQuery.docs, ...nameQuery.docs].forEach((doc) => {
      // Skip the current user
      if (doc.id === currentUserId) {
        return;
      }

      if (!usersMap.has(doc.id)) {
        usersMap.set(doc.id, {
          uid: doc.id,
          email: doc.data().email,
          displayName: doc.data().displayName || "User",
          photoURL: doc.data().photoURL || "https://via.placeholder.com/40",
        });
      }
    });

    const results = Array.from(usersMap.values());
    
    return { results };
  } catch (error) {
    console.error('Error in searchUsers:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Check if a user is a team admin
exports.checkIsTeamAdmin = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to check team permissions'
      );
    }

    const { teamId } = request.data;
    if (!teamId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID is required'
      );
    }

    const isAdmin = await isUserTeamAdmin(teamId, request.auth.uid);
    
    return { isAdmin };
  } catch (error) {
    console.error('Error in checkIsTeamAdmin:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
});

// Check if a user is a team manager or admin
exports.checkIsTeamManager = functions.https.onCall(async (request) => {
  try {
    // Ensure user is authenticated
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to check team permissions'
      );
    }

    const { teamId } = request.data;
    if (!teamId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Team ID is required'
      );
    }

    const isManager = await isUserTeamManager(teamId, request.auth.uid);
    
    return { isManager };
  } catch (error) {
    console.error('Error in checkIsTeamManager:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'An internal error occurred');
  }
}); 