const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

// check if user is team member
const isUserTeamMember = async (teamId, userId) => {
  try {
    const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
    
    if (!teamDoc.exists) {
      return false;
    }
    
    const teamData = teamDoc.data();
    return teamData.members.includes(userId);
  } catch (error) {
    console.error("Error checking team membership:", error);
    return false;
  }
};

// create task
exports.createTask = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to create tasks.'
    );
  }

  // verify request data
  if (!request.data.teamId || !request.data.taskData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID and task data are required.'
    );
  }

  const { teamId, taskData } = request.data;
  const userId = request.auth.uid;

  try {
    // check if user is team member
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }

    // get team data
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found.'
      );
    }

    // handle date
    let formattedStartDate = taskData.start_date;
    if (formattedStartDate && typeof formattedStartDate === 'string') {
      formattedStartDate = admin.firestore.Timestamp.fromDate(new Date(formattedStartDate));
    }

    // current time of Firestore Timestamp (do not use serverTimestamp, it cannot be used in array)
    const now = admin.firestore.Timestamp.fromDate(new Date());

    // create task data, use Date.now() to generate unique ID
    const task = {
      id: Date.now(), 
      text: taskData.text,
      description: taskData.description || '',
      start_date: formattedStartDate || admin.firestore.Timestamp.fromDate(new Date()),
      duration: parseInt(taskData.duration) || 1,
      type: taskData.type || 'task',
      priority: taskData.priority || 'medium',
      progress: parseInt(taskData.progress) || 0,
      status: taskData.status || 'notStarted',
      assignees: taskData.assignees || [],
      // createdBy: userId,
      // createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // update Firestore
    await teamRef.update({
      tasks: admin.firestore.FieldValue.arrayUnion(task)
    });

    // send notification to task assignees
    if (task.assignees && task.assignees.length > 0) {
      const batch = admin.firestore().batch();
      const teamData = teamSnap.data();
      
      for (const assignee of task.assignees) {
        if (assignee.uid !== userId) { // do not send notification to yourself
          const notificationRef = admin.firestore().collection('notifications').doc();
          batch.set(notificationRef, {
            userId: assignee.uid,
            title: 'New Task Assignment',
            message: `You've been assigned to "${task.text}" in team "${teamData.name}"`,
            type: 'task_assignment',
            teamId: teamId,
            teamName: teamData.name,
            taskId: task.id,
            taskName: task.text,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp() // here can use serverTimestamp because it is not in array
          });
        }
      }
      
      await batch.commit();
    }

    return { 
      success: true,
      taskId: task.id,
      task: task
    };
  } catch (error) {
    console.error("Error creating task:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to create task. Please try again.'
    );
  }
});

// update task
exports.updateTask = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to update tasks.'
    );
  }

  // verify request data
  if (!request.data.teamId || !request.data.taskId || !request.data.taskData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID, task ID, and task data are required.'
    );
  }

  const { teamId, taskId, taskData } = request.data;
  const userId = request.auth.uid;

  try {
    // check if user is team member
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }

    // get team data
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found.'
      );
    }

    const teamData = teamSnap.data();
    const tasks = teamData.tasks || [];
    
    // find task
    const taskIndex = tasks.findIndex(t => t.id.toString() === taskId.toString());
    
    if (taskIndex === -1) {
      throw new functions.https.HttpsError(
        'not-found',
        'Task not found.'
      );
    }

    // current time of Firestore Timestamp
    const now = admin.firestore.Timestamp.fromDate(new Date());

    // save original start_date, ensure it is Timestamp format
    let originalStartDate = tasks[taskIndex].start_date;
    if (originalStartDate && !(originalStartDate instanceof admin.firestore.Timestamp)) {
        // try to convert back to Timestamp from possible serialized format
        if (originalStartDate.seconds !== undefined) {
            originalStartDate = new admin.firestore.Timestamp(originalStartDate.seconds, originalStartDate.nanoseconds || 0);
        } else {
            // if cannot convert, use current date or record error
            console.warn("Original start_date is not a Timestamp, using current date");
            originalStartDate = admin.firestore.Timestamp.fromDate(new Date());
        }
    }

    // create a copy of incoming data
    const incomingTaskData = {...taskData};
    
    // explicitly delete start_date in incoming data to prevent override
    if (incomingTaskData.start_date !== undefined) {
      delete incomingTaskData.start_date;
      console.log("start_date field explicitly removed from incoming data before merge.");
    }

    // update task data: merge original task and incoming data without start_date
    const updatedTask = {
      ...tasks[taskIndex], // original task
      ...incomingTaskData, // incoming update (without start_date)
      start_date: originalStartDate, // force use original start_date
      updatedBy: userId,
      updatedAt: now // use static Timestamp instead of serverTimestamp
    };

    // update task array
    tasks[taskIndex] = updatedTask;

    // update Firestore
    await teamRef.update({ tasks });

    // return updated task data directly
    return { 
      success: true,
      taskId: updatedTask.id,
      task: updatedTask // frontend will handle date format
    };
  } catch (error) {
    console.error("Error updating task:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to update task. Please try again.'
    );
  }
});

// delete task
exports.deleteTask = functions.https.onCall(async (request) => {
  // verify if user is logged in
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to delete tasks.'
    );
  }

  // verify request data
  if (!request.data.teamId || !request.data.taskId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID and task ID are required.'
    );
  }

  const { teamId, taskId } = request.data;
  const userId = request.auth.uid;

  try {
    // check if user is team member
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }
    
    // get team data
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found.'
      );
    }

    const teamData = teamSnap.data();
    
    // find task
    const tasks = teamData.tasks || [];
    const updatedTasks = tasks.filter(t => t.id.toString() !== taskId.toString());
    
    if (updatedTasks.length === tasks.length) {
      throw new functions.https.HttpsError(
        'not-found',
        'Task not found.'
      );
    }

    // update Firestore
    await teamRef.update({
      tasks: updatedTasks
    });

    return { 
      success: true,
      taskId
    };
  } catch (error) {
    console.error("Error deleting task:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to delete task. Please try again.'
    );
  }
}); 