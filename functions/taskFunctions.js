const functions = require('firebase-functions/v2');
const admin = require('firebase-admin');

// 检查用户是否是团队成员
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

// 创建任务
exports.createTask = functions.https.onCall(async (request) => {
  // 验证用户是否已登录
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to create tasks.'
    );
  }

  // 验证请求数据
  if (!request.data.teamId || !request.data.taskData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID and task data are required.'
    );
  }

  const { teamId, taskData } = request.data;
  const userId = request.auth.uid;

  try {
    // 检查用户是否是团队成员
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }

    // 获取团队数据
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found.'
      );
    }

    // 处理日期
    let formattedStartDate = taskData.start_date;
    if (formattedStartDate && typeof formattedStartDate === 'string') {
      formattedStartDate = admin.firestore.Timestamp.fromDate(new Date(formattedStartDate));
    }

    // 当前时间的 Firestore Timestamp (不使用 serverTimestamp，因为它不能在数组中使用)
    const now = admin.firestore.Timestamp.fromDate(new Date());

    // 创建任务数据，使用 Date.now() 生成唯一的ID
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

    // 更新 Firestore
    await teamRef.update({
      tasks: admin.firestore.FieldValue.arrayUnion(task)
    });

    // 向任务负责人发送通知
    if (task.assignees && task.assignees.length > 0) {
      const batch = admin.firestore().batch();
      const teamData = teamSnap.data();
      
      for (const assignee of task.assignees) {
        if (assignee.uid !== userId) { // 不给自己发通知
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
            // createdAt: admin.firestore.FieldValue.serverTimestamp() // 这里可以使用 serverTimestamp 因为不是在数组中
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

// 更新任务
exports.updateTask = functions.https.onCall(async (request) => {
  // 验证用户是否已登录
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to update tasks.'
    );
  }

  // 验证请求数据
  if (!request.data.teamId || !request.data.taskId || !request.data.taskData) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID, task ID, and task data are required.'
    );
  }

  const { teamId, taskId, taskData } = request.data;
  const userId = request.auth.uid;

  try {
    // 检查用户是否是团队成员
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }

    // 获取团队数据
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
    
    // 查找任务
    const taskIndex = tasks.findIndex(t => t.id.toString() === taskId.toString());
    
    if (taskIndex === -1) {
      throw new functions.https.HttpsError(
        'not-found',
        'Task not found.'
      );
    }

    // 当前时间的 Firestore Timestamp
    const now = admin.firestore.Timestamp.fromDate(new Date());

    // 保存原始的start_date，确保它是Timestamp格式
    let originalStartDate = tasks[taskIndex].start_date;
    if (originalStartDate && !(originalStartDate instanceof admin.firestore.Timestamp)) {
        // 尝试从可能的序列化格式转换回Timestamp
        if (originalStartDate.seconds !== undefined) {
            originalStartDate = new admin.firestore.Timestamp(originalStartDate.seconds, originalStartDate.nanoseconds || 0);
        } else {
            // 如果无法转换，使用当前时间或记录错误
            console.warn("Original start_date is not a Timestamp, using current date");
            originalStartDate = admin.firestore.Timestamp.fromDate(new Date());
        }
    }

    // 创建传入数据的副本
    const incomingTaskData = {...taskData};
    
    // 显式删除传入数据中的start_date，防止覆盖
    if (incomingTaskData.start_date !== undefined) {
      delete incomingTaskData.start_date;
      console.log("start_date field explicitly removed from incoming data before merge.");
    }

    // 更新任务数据：合并原始任务和移除了start_date的传入数据
    const updatedTask = {
      ...tasks[taskIndex], // 原始任务
      ...incomingTaskData, // 传入的更新（不含start_date）
      start_date: originalStartDate, // 强制使用原始的start_date
      updatedBy: userId,
      updatedAt: now // 使用静态 Timestamp 而不是 serverTimestamp
    };

    // 更新任务数组
    tasks[taskIndex] = updatedTask;

    // 更新 Firestore
    await teamRef.update({ tasks });

    // 直接返回更新后的任务数据
    return { 
      success: true,
      taskId: updatedTask.id,
      task: updatedTask // 前端会处理日期格式
    };
  } catch (error) {
    console.error("Error updating task:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to update task. Please try again.'
    );
  }
});

// 删除任务
exports.deleteTask = functions.https.onCall(async (request) => {
  // 验证用户是否已登录
  if (!request.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to delete tasks.'
    );
  }

  // 验证请求数据
  if (!request.data.teamId || !request.data.taskId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Team ID and task ID are required.'
    );
  }

  const { teamId, taskId } = request.data;
  const userId = request.auth.uid;

  try {
    // 检查用户是否是团队成员
    const isMember = await isUserTeamMember(teamId, userId);
    if (!isMember) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You are not a member of this team.'
      );
    }
    
    // 获取团队数据
    const teamRef = admin.firestore().collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    
    if (!teamSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Team not found.'
      );
    }

    const teamData = teamSnap.data();
    
    // 查找任务
    const tasks = teamData.tasks || [];
    const updatedTasks = tasks.filter(t => t.id.toString() !== taskId.toString());
    
    if (updatedTasks.length === tasks.length) {
      throw new functions.https.HttpsError(
        'not-found',
        'Task not found.'
      );
    }

    // 更新 Firestore
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