import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, Timestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

// 初始化 Firebase Functions
const functions = getFunctions();

const Timeline = ({ teamId, refreshKey = 0 }) => {
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [draggedTask, setDraggedTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTask, setEditedTask] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    priority: 'all',
    assignee: 'all',
    dueDate: 'all',
    progress: 'all'
  });
  const [sortOption, setSortOption] = useState('dueDate');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [showAssigneeSelector, setShowAssigneeSelector] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [taskFiles, setTaskFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  // 新增状态变量用于管理通知消息
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'error' // 'error', 'warning', 'info', 'success'
  });
  // 新增状态变量用于文件删除确认
  const [showFileDeleteConfirm, setShowFileDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);

  // 显示通知的辅助函数
  const showNotification = (message, type = 'error') => {
    setNotification({
      show: true,
      message,
      type
    });
    
    // 3秒后自动关闭通知
    setTimeout(() => {
      setNotification(prev => ({...prev, show: false}));
    }, 5000);
  };

  // 关闭通知的辅助函数
  const closeNotification = () => {
    setNotification(prev => ({...prev, show: false}));
  };

  // Fetch tasks from Firestore - 修改以包含refreshKey依赖
  useEffect(() => {
    const fetchTasks = async () => {
      if (!teamId) {
        setError('No team ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          if (teamData.tasks && Array.isArray(teamData.tasks)) {
            // Process tasks to add bgColor based on priority
            const processedTasks = teamData.tasks.map(task => {
              const bgColor = getBgColorForPriority(task.priority);
              return {
                ...task,
                bgColor
              };
            });
            
            setTasks(processedTasks);
          } else {
            setTasks([]);
          }
        } else {
          setError('Team not found');
        }
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setError(`Error fetching tasks: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [teamId, refreshKey]); // 添加refreshKey作为依赖项

  // Get current user role in the team
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!teamId) return;
      
      try {
        // 直接使用已导入的 auth 对象，而不是调用 getAuth()
        const user = auth.currentUser;
        
        if (user) {
          console.log("Current user:", user.uid, user.email);
          setCurrentUser(user);
          
          // Get team data to check user role
          const teamRef = doc(db, 'teams', teamId);
          const teamSnap = await getDoc(teamRef);
          
          if (teamSnap.exists()) {
            const teamData = teamSnap.data();
            console.log("Team data:", teamData);
            console.log("Members data:", teamData.membersData);
            
            if (teamData.membersData && Array.isArray(teamData.membersData)) {
              // 在数组中查找当前用户
              const memberData = teamData.membersData.find(member => member.uid === user.uid);
              if (memberData) {
                const role = memberData.role;
                console.log("User role found in array:", role);
                setUserRole(role);
              } else {
                console.log("User not found in team members array");
              }
            } else if (teamData.membersData && typeof teamData.membersData === 'object') {
              // 保留原来的对象查找逻辑作为备份
              if (teamData.membersData[user.uid]) {
                const role = teamData.membersData[user.uid].role;
                console.log("User role found in object:", role);
                setUserRole(role);
              } else {
                console.log("User not found in team members object");
              }
            } else {
              console.log("No valid membersData structure found");
            }
          } else {
            console.log("Team not found");
          }
        } else {
          console.log("No authenticated user");
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    
    fetchUserRole();
  }, [teamId]);

  // 在 useEffect 中获取团队成员
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (!teamId) return;
      
      try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          if (teamData.membersData && Array.isArray(teamData.membersData)) {
            setTeamMembers(teamData.membersData);
          }
        }
      } catch (err) {
        console.error('Error fetching team members:', err);
      }
    };
    
    fetchTeamMembers();
  }, [teamId]);

  // 初始化选中的负责人
  useEffect(() => {
    if (editedTask && editedTask.assignees) {
      setSelectedAssignees(editedTask.assignees);
    } else {
      setSelectedAssignees([]);
    }
  }, [editedTask]);

  // 在任务详情打开时获取评论
  useEffect(() => {
    const fetchComments = async () => {
      if (!selectedTask) return;
      
      try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          // 获取任务的评论，如果没有则设为空数组
          const taskComments = teamData.tasks.find(t => t.id === selectedTask.id)?.comments || [];
          setComments(taskComments);
        }
      } catch (err) {
        console.error('Error fetching comments:', err);
      }
    };
    
    if (selectedTask && showTaskDetails) {
      fetchComments();
    }
  }, [selectedTask, showTaskDetails, teamId]);

  // 在任务详情打开时获取文件列表
  useEffect(() => {
    const fetchTaskFiles = async () => {
      if (!selectedTask) return;
      
      try {
        const teamRef = doc(db, 'teams', teamId);
        const teamSnap = await getDoc(teamRef);
        
        if (teamSnap.exists()) {
          const teamData = teamSnap.data();
          // 获取任务的文件，如果没有则设为空数组
          const files = teamData.tasks.find(t => t.id === selectedTask.id)?.files || [];
          setTaskFiles(files);
        }
      } catch (err) {
        console.error('Error fetching task files:', err);
      }
    };
    
    if (selectedTask && showTaskDetails) {
      fetchTaskFiles();
    }
  }, [selectedTask, showTaskDetails, teamId]);

  const handleDragStart = (task) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (newStatus) => {
    if (draggedTask) {
      // 检查当前用户是否是任务负责人
      const isAssignee = draggedTask.assignees && 
                        draggedTask.assignees.some(assignee => assignee.uid === currentUser?.uid);
      
      if (!isAssignee) {
        showNotification('Only task assignees can update task status.', 'warning');
        return;
      }
      
      // 允许更新：任务负责人可以更改任务状态，无论他们是否是管理员或经理
      
      // 更新本地状态
      const updatedTasks = tasks.map((task) => {
        if (task.id === draggedTask.id) {
          return { ...task, status: newStatus };
        }
        return task;
      });
      setTasks(updatedTasks);
      
      try {
        // 使用云函数更新任务状态
        const updateTaskFunction = httpsCallable(functions, 'updateTask');
        const result = await updateTaskFunction({
          teamId: teamId,
          taskId: draggedTask.id,
          taskData: {
            status: newStatus
          }
        });
        
        console.log('Task status updated successfully:', result.data);
      } catch (err) {
        console.error('Error updating task status:', err);
        // 如果更新失败，恢复原始状态
        setTasks(tasks);
        showNotification('Failed to update task status. Please try again.', 'error');
      } finally {
        setDraggedTask(null);
      }
    }
  };

  const openTaskDetails = (task, e) => {
    // Prevent drag start when clicking on a task
    if (e) {
      e.stopPropagation();
    }
    setSelectedTask(task);
    setShowTaskDetails(true);
    setIsEditing(false);
  };

  const closeTaskDetails = () => {
    setShowTaskDetails(false);
    setSelectedTask(null);
    setIsEditing(false);
    setEditedTask(null);
  };

  // 检查当前用户是否是任务负责人
  const isTaskAssignee = () => {
    if (!selectedTask || !currentUser) return false;
    
    return selectedTask.assignees && 
           selectedTask.assignees.some(assignee => assignee.uid === currentUser.uid);
  };
  
  // 检查当前用户是否有任务管理权限（管理员、经理或任务负责人）
  const canEditTask = () => {
    if (!selectedTask || !currentUser) return false;
    
    // 如果是任务负责人，可以编辑
    if (isTaskAssignee()) return true;
    
    // 如果是管理员或经理，也可以编辑
    return userRole === 'admin' || userRole === 'manager';
  };
  
  // 检查当前用户是否可以更改任务状态和进度（只有任务负责人可以）
  const canUpdateStatusAndProgress = () => {
    return isTaskAssignee();
  };

  // 允许开始编辑任务
  const handleEditTask = () => {
    // 检查权限 - 任何任务编辑都至少需要是任务负责人
    if (!isTaskAssignee() && userRole !== 'admin' && userRole !== 'manager') {
      showNotification('You do not have permission to edit this task. Only task assignees, team managers or admins can edit tasks.', 'error');
      return;
    }
    
    setEditedTask({...selectedTask});
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedTask(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedTask(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePriorityChange = (priority) => {
    setEditedTask(prev => ({
      ...prev,
      priority
    }));
  };

  const handleStatusChange = (status) => {
    if (!canUpdateStatusAndProgress()) {
      showNotification('Only task assignees can update task status.', 'warning');
      return;
    }
    
    setEditedTask(prevState => ({
      ...prevState,
      status
    }));
  };

  const handleProgressChange = (e) => {
    if (!canUpdateStatusAndProgress()) {
      showNotification('Only task assignees can update task progress.', 'warning');
      return;
    }
    
    const progress = parseInt(e.target.value) || 0;
    setEditedTask(prevState => ({
      ...prevState,
      progress: Math.min(100, Math.max(0, progress))
    }));
  };

  const handleSaveChanges = async () => {
    if (!editedTask) return;
    
    try {
      setIsSaving(true);
      
      // 检查权限 - 确定哪些字段发生了变化
      const originalTask = tasks.find(t => t.id === editedTask.id);
      if (!originalTask) {
        showNotification('Task not found', 'error');
        setIsSaving(false);
        return;
      }
      
      const statusChanged = originalTask.status !== editedTask.status;
      const progressChanged = originalTask.progress !== editedTask.progress;
      const otherFieldsChanged = 
        originalTask.text !== editedTask.text ||
        originalTask.description !== editedTask.description ||
        originalTask.priority !== editedTask.priority ||
        originalTask.duration !== editedTask.duration;
      
      // 检查权限：如果有"其他字段"的更改，需要管理员/经理权限
      if (otherFieldsChanged && userRole !== 'admin' && userRole !== 'manager' && !isTaskAssignee()) {
        showNotification('Only team managers or admins can modify task details other than status and progress.', 'error');
        setIsSaving(false);
        return;
      }
      
      // 如果只有状态和进度变化，只需要是任务负责人
      if ((statusChanged || progressChanged) && !isTaskAssignee()) {
        showNotification('Only task assignees can update status and progress.', 'error');
        setIsSaving(false);
        return;
      }
      
      // 如果用户只是任务负责人但不是管理员/经理，确保他们只修改了状态和进度
      if (isTaskAssignee() && userRole !== 'admin' && userRole !== 'manager' && otherFieldsChanged) {
        // 恢复除状态和进度外的所有字段为原始值，但允许状态和进度的变化保留
        const taskWithOnlyStatusProgressChanges = {
          ...originalTask,
          status: editedTask.status,
          progress: editedTask.progress
        };
        
        // 更新编辑中的任务
        setEditedTask(taskWithOnlyStatusProgressChanges);
        
        // 使用修正后的任务数据进行保存
        const updateTaskFunction = httpsCallable(functions, 'updateTask');
        
        // Remove start_date before sending
        const { start_date: removedStartDate1, ...taskDataForUpdate1 } = taskWithOnlyStatusProgressChanges;
        
        const result = await updateTaskFunction({
          teamId: teamId,
          taskId: taskWithOnlyStatusProgressChanges.id,
          taskData: taskDataForUpdate1 // Use data without start_date
        });
        
        console.log('Task updated with restricted changes:', result.data);
        
        // 更新本地状态
        setTasks(prevTasks => 
          prevTasks.map(task => 
            task.id === taskWithOnlyStatusProgressChanges.id 
              ? {...task, ...taskWithOnlyStatusProgressChanges} 
              : task
          )
        );
        
        setIsEditing(false);
        setIsSaving(false);
        
        // 显示提示，让用户知道只有部分更改被保存
        showNotification('As a task assignee, you can only update status and progress. Other changes have been reverted.', 'info');
        
        return;
      }
      
      // 如果有权限进行所有更改，则正常保存
      const updateTaskFunction = httpsCallable(functions, 'updateTask');
      
      // Remove start_date before sending
      const { start_date: removedStartDate2, ...taskDataForUpdate2 } = editedTask;
      
      const result = await updateTaskFunction({
        teamId: teamId,
        taskId: editedTask.id,
        taskData: taskDataForUpdate2 // Use data without start_date
      });
      
      console.log('Task fully updated:', result.data);
      
      // 更新本地状态
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === editedTask.id 
            ? {...task, ...editedTask} 
            : task
        )
      );
      
      // 更新选中的任务
      setSelectedTask({...editedTask});
      
      // 重置编辑状态
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating task:', err);
      showNotification('Failed to update task. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getBgColorForPriority = (priority) => {
    if (priority === 'high') return 'bg-red-400';
    if (priority === 'medium') return 'bg-yellow-400';
    if (priority === 'low') return 'bg-emerald-400';
    return 'bg-blue-500'; // Default
  };

  // 修复状态过滤器和过滤逻辑
  const statusFilters = [
    { label: 'All Tasks', value: 'all' },
    { label: 'Pending', value: 'notStarted' },
    { label: 'In Progress', value: 'inProgress' },
    { label: 'Completed', value: 'completed' },
    { label: 'Overdue', value: 'overdue' },
  ];

  // 更新过滤任务的函数
  const getFilteredTasks = () => {
    return tasks.filter((task) => {
      // 首先应用状态过滤器
      let matchesStatus = true;
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'overdue') {
          // 检查任务是否逾期
          const dueDate = task.start_date && typeof task.start_date.toDate === 'function' 
            ? task.start_date.toDate() : new Date(task.start_date);
          const today = new Date();
          matchesStatus = dueDate < today && task.status !== 'completed';
        } else {
          matchesStatus = task.status === selectedStatus;
        }
      }
      
      // 然后应用搜索文本过滤器
      const matchesSearch = task.text.toLowerCase().includes(searchText.toLowerCase()) || 
                           (task.description && task.description.toLowerCase().includes(searchText.toLowerCase()));
      
      // 应用优先级过滤器
      const matchesPriority = filterOptions.priority === 'all' || task.priority === filterOptions.priority;
      
      // 应用负责人过滤器
      const matchesAssignee = filterOptions.assignee === 'all' || 
                             (task.assignees && task.assignees.some(assignee => 
                               assignee.uid === filterOptions.assignee || assignee.email === filterOptions.assignee));
      
      // 应用截止日期过滤器
      let matchesDueDate = true;
      if (filterOptions.dueDate === 'overdue') {
        const dueDate = task.start_date && typeof task.start_date.toDate === 'function' 
          ? task.start_date.toDate() : new Date(task.start_date);
        matchesDueDate = dueDate < new Date();
      } else if (filterOptions.dueDate === 'today') {
        const dueDate = task.start_date && typeof task.start_date.toDate === 'function' 
          ? task.start_date.toDate() : new Date(task.start_date);
        const today = new Date();
        matchesDueDate = dueDate.getDate() === today.getDate() && 
                        dueDate.getMonth() === today.getMonth() && 
                        dueDate.getFullYear() === today.getFullYear();
      } else if (filterOptions.dueDate === 'thisWeek') {
        const dueDate = task.start_date && typeof task.start_date.toDate === 'function' 
          ? task.start_date.toDate() : new Date(task.start_date);
        const today = new Date();
        const thisWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
        matchesDueDate = dueDate >= today && dueDate <= thisWeek;
      }
      
      // 应用进度过滤器
      let matchesProgress = true;
      if (filterOptions.progress === 'notStarted') {
        matchesProgress = task.progress === 0;
      } else if (filterOptions.progress === 'inProgress') {
        matchesProgress = task.progress > 0 && task.progress < 100;
      } else if (filterOptions.progress === 'completed') {
        matchesProgress = task.progress === 100;
      }
      
      return matchesStatus && matchesSearch && matchesPriority && matchesAssignee && matchesDueDate && matchesProgress;
    });
  };

  const getSortedTasks = (filteredTasks) => {
    return [...filteredTasks].sort((a, b) => {
      let comparison = 0;
      
      if (sortOption === 'dueDate') {
        const dateA = a.start_date && typeof a.start_date.toDate === 'function' 
          ? a.start_date.toDate() : new Date(a.start_date);
        const dateB = b.start_date && typeof b.start_date.toDate === 'function' 
          ? b.start_date.toDate() : new Date(b.start_date);
        comparison = dateA - dateB;
      } else if (sortOption === 'priority') {
        const priorityValues = { high: 3, medium: 2, low: 1 };
        comparison = priorityValues[b.priority] - priorityValues[a.priority];
      } else if (sortOption === 'progress') {
        comparison = a.progress - b.progress;
      } else if (sortOption === 'title') {
        comparison = a.text.localeCompare(b.text);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  };

  // 使用过滤和排序函数
  const filteredTasks = getFilteredTasks();
  const sortedAndFilteredTasks = getSortedTasks(filteredTasks);

  // 重置过滤器
  const resetFilters = () => {
    setFilterOptions({
      priority: 'all',
      assignee: 'all',
      dueDate: 'all',
      progress: 'all'
    });
  };

  // 处理过滤器变化
  const handleFilterChange = (filterName, value) => {
    setFilterOptions(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  // 处理排序变化
  const handleSortChange = (option) => {
    if (sortOption === option) {
      // 如果点击的是当前排序选项，则切换排序方向
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 否则，更改排序选项并设置为升序
      setSortOption(option);
      setSortDirection('asc');
    }
  };

  // Get status label from value
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'notStarted':
        return 'bg-yellow-100 text-yellow-800';
      case 'inProgress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'notStarted':
        return 'Pending';
      case 'inProgress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return 'Unknown';
    }
  };

  // Check if user can edit tasks
  const canEditTasks = userRole === 'admin' || userRole === 'manager' || isTaskAssignee();

  // 修改删除任务的处理函数
  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    
    // 显示自定义确认弹窗，而不是使用 window.confirm
    setTaskToDelete(selectedTask);
    setShowDeleteConfirm(true);
  };

  // 添加确认删除的处理函数
  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    
    try {
      setIsSaving(true);
      
      // 使用云函数删除任务
      const deleteTaskFunction = httpsCallable(functions, 'deleteTask');
      const result = await deleteTaskFunction({
        teamId: teamId,
        taskId: taskToDelete.id
      });
      
      console.log('Task deleted successfully:', result.data);
      
      // 更新本地状态
      setTasks(prevTasks => prevTasks.filter(task => task.id !== taskToDelete.id));
      
      // 关闭模态框和确认弹窗
      closeTaskDetails();
      setShowDeleteConfirm(false);
      setTaskToDelete(null);
    } catch (err) {
      console.error('Error deleting task:', err);
      showNotification('Failed to delete task. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 取消删除的处理函数
  const cancelDeleteTask = () => {
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
  };

  // 处理负责人选择变化
  const handleAssigneeChange = (member) => {
    setSelectedAssignees(prev => {
      // 检查成员是否已经被选中
      const isAlreadySelected = prev.some(assignee => assignee.uid === member.uid);
      
      if (isAlreadySelected) {
        // 如果已选中，则移除
        return prev.filter(assignee => assignee.uid !== member.uid);
      } else {
        // 如果未选中，则添加
        return [...prev, member];
      }
    });
  };

  // 保存选中的负责人
  const saveAssignees = () => {
    setEditedTask(prev => ({
      ...prev,
      assignees: selectedAssignees
    }));
    setShowAssigneeSelector(false);
  };

  // 添加评论的处理函数
  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser || !selectedTask) return;
    
    try {
      setIsSubmittingComment(true);
      
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      
      if (teamSnap.exists()) {
        const teamData = teamSnap.data();
        const taskIndex = teamData.tasks.findIndex(t => t.id === selectedTask.id);
        
        if (taskIndex !== -1) {
          // 创建新评论对象
          const newCommentObj = {
            id: Date.now().toString(),
            text: newComment.trim(),
            createdBy: {
              uid: currentUser.uid,
              displayName: currentUser.displayName || currentUser.email,
              email: currentUser.email
            },
            createdAt: new Date(),
            replyTo: replyTo
          };
          
          // 更新本地状态
          const updatedComments = [...comments, newCommentObj];
          setComments(updatedComments);
          
          // 更新 Firestore
          const updatedTasks = [...teamData.tasks];
          if (!updatedTasks[taskIndex].comments) {
            updatedTasks[taskIndex].comments = [];
          }
          updatedTasks[taskIndex].comments.push(newCommentObj);
          
          await updateDoc(teamRef, {
            tasks: updatedTasks
          });
          
          // 发送通知
          try {
            const sendNotificationFunction = httpsCallable(functions, 'sendNotification');
            
            // 不同的通知逻辑
            if (replyTo) {
              // 回复评论的情况: 向被回复用户发送通知
              if (replyTo.createdBy && replyTo.createdBy.uid && replyTo.createdBy.uid !== currentUser.uid) {
                await sendNotificationFunction({
                  userId: replyTo.createdBy.uid,
                  title: 'New Comment Reply',
                  message: `${currentUser.displayName || currentUser.email} replied to your comment on task "${selectedTask.text}"`,
                  type: 'comment_reply',
                  teamId: teamId,
                  teamName: teamData.name,
                  taskId: selectedTask.id,
                  taskName: selectedTask.text
                });
                showNotification(`通知已发送给评论作者：${replyTo.createdBy.displayName || replyTo.createdBy.email}`, 'success');
              }
            } else {
              // 新评论的情况: 通知所有任务负责人
              if (selectedTask.assignees && selectedTask.assignees.length > 0) {
                const notificationPromises = selectedTask.assignees
                  .filter(assignee => assignee.uid !== currentUser.uid) // 不给自己发送通知
                  .map(assignee => 
                    sendNotificationFunction({
                      userId: assignee.uid,
                      title: 'New Comment on Task',
                      message: `${currentUser.displayName || currentUser.email} commented on task "${selectedTask.text}" that you're assigned to`,
                      type: 'task_comment',
                      teamId: teamId,
                      teamName: teamData.name,
                      taskId: selectedTask.id,
                      taskName: selectedTask.text
                    })
                  );
                
                await Promise.all(notificationPromises);
                
                if (selectedTask.assignees.some(assignee => assignee.uid !== currentUser.uid)) {
                  showNotification('通知已发送给所有任务负责人', 'success');
                }
              }
            }
          } catch (notificationError) {
            console.error('Failed to send notifications:', notificationError);
            // 不要阻止评论的添加，仅记录通知错误
          }
          
          // 重置表单
          setNewComment('');
          setReplyTo(null);
        }
      }
    } catch (err) {
      console.error('Error adding comment:', err);
      showNotification('Failed to add comment. Please try again.', 'error');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // 格式化日期时间
  const formatDateTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (err) {
      console.error('Error formatting date:', err);
      return '';
    }
  };

  // 设置回复目标
  const handleReply = (comment) => {
    setReplyTo(comment);
    // 聚焦评论输入框
    document.getElementById('comment-input').focus();
  };

  // 取消回复
  const cancelReply = () => {
    setReplyTo(null);
  };

  // 处理文件上传
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // 检查文件大小 (限制为 20MB)
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('File size exceeds 20MB limit');
      return;
    }
    
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);
      
      // 创建唯一的文件路径
      const fileId = Date.now().toString();
      const fileExtension = file.name.split('.').pop();
      const filePath = `teams/${teamId}/tasks/${selectedTask.id}/${fileId}.${fileExtension}`;
      const fileRef = storageRef(storage, filePath);
      
      // 上传文件
      const uploadTask = uploadBytesResumable(fileRef, file);
      
      // 监听上传进度
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          
          // 提供更具体的错误消息
          if (error.code === 'storage/unauthorized') {
            setUploadError('Permission denied. You may not have access to upload files to this location.');
          } else {
            setUploadError(`Failed to upload file: ${error.message}`);
          }
          
          setIsUploading(false);
        },
        async () => {
          // 上传完成，获取下载 URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // 创建文件对象
          const fileObject = {
            id: fileId,
            name: file.name,
            type: file.type,
            size: file.size,
            path: filePath,
            url: downloadURL,
            uploadedBy: {
              uid: currentUser.uid,
              displayName: currentUser.displayName || currentUser.email,
              email: currentUser.email
            },
            uploadedAt: new Date()
          };
          
          // 更新 Firestore
          const teamRef = doc(db, 'teams', teamId);
          const teamSnap = await getDoc(teamRef);
          
          if (teamSnap.exists()) {
            const teamData = teamSnap.data();
            const taskIndex = teamData.tasks.findIndex(t => t.id === selectedTask.id);
            
            if (taskIndex !== -1) {
              const updatedTasks = [...teamData.tasks];
              if (!updatedTasks[taskIndex].files) {
                updatedTasks[taskIndex].files = [];
              }
              updatedTasks[taskIndex].files.push(fileObject);
              
              await updateDoc(teamRef, {
                tasks: updatedTasks
              });
              
              // 更新本地状态
              setTaskFiles(prev => [...prev, fileObject]);
            }
          }
          
          setIsUploading(false);
          setUploadProgress(0);
        }
      );
    } catch (err) {
      console.error('Error handling file upload:', err);
      setUploadError('Failed to upload file. Please try again.');
      setIsUploading(false);
    }
  };

  // 修改为打开文件删除确认对话框
  const handleDeleteFile = (file) => {
    if (!file || !selectedTask) return;
    
    // 检查是否有权限删除文件（是任务负责人或文件上传者）
    const isAssignee = isTaskAssignee();
    const isUploader = file.uploadedBy && currentUser && file.uploadedBy.uid === currentUser.uid;
    
    if (!isAssignee && !isUploader) {
      showNotification('Only task assignees or the person who uploaded the file can delete it.', 'error');
      return;
    }
    
    // 显示确认对话框
    setFileToDelete(file);
    setShowFileDeleteConfirm(true);
  };
  
  // 确认删除文件的函数
  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    
    try {
      setIsSaving(true);
      
      // 删除文件
      const fileRef = storageRef(storage, fileToDelete.path);
      await deleteObject(fileRef);
      
      // 更新任务文件列表
      const updatedFiles = taskFiles.filter(f => f.path !== fileToDelete.path);
      setTaskFiles(updatedFiles);
      
      // 更新 Firestore 文档中的引用
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      
      if (teamSnap.exists()) {
        const teamData = teamSnap.data();
        const taskIndex = teamData.tasks.findIndex(t => t.id === selectedTask.id);
        
        if (taskIndex !== -1) {
          const updatedTasks = [...teamData.tasks];
          if (!updatedTasks[taskIndex].files) {
            updatedTasks[taskIndex].files = [];
          }
          
          // 从文件列表中移除文件
          updatedTasks[taskIndex].files = updatedTasks[taskIndex].files.filter(
            f => f.path !== fileToDelete.path
          );
          
          await updateDoc(teamRef, {
            tasks: updatedTasks
          });
          
          // 显示成功通知
          showNotification(`File "${fileToDelete.name}" has been deleted successfully`, 'success');
        }
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      showNotification('Failed to delete file. Please try again.', 'error');
    } finally {
      setIsSaving(false);
      // 关闭确认对话框
      setShowFileDeleteConfirm(false);
      setFileToDelete(null);
    }
  };
  
  // 取消删除文件
  const cancelFileDelete = () => {
    setShowFileDeleteConfirm(false);
    setFileToDelete(null);
  };

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 获取文件图标
  const getFileIcon = (fileType) => {
    if (fileType.includes('image')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
    } else if (fileType.includes('pdf')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
    } else if (fileType.includes('excel') || fileType.includes('sheet')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
    } else {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
    }
  };

  // 添加计算截止日期的函数
  const calculateDueDate = (startDate, duration) => {
    if (!startDate) return null;
    
    // 确保我们有一个 JavaScript Date 对象
    const start = startDate instanceof Date 
      ? new Date(startDate) 
      : (startDate.toDate ? startDate.toDate() : new Date(startDate));
    
    // 复制日期以避免修改原始日期
    const dueDate = new Date(start);
    
    // 添加持续时间（天数）
    dueDate.setDate(dueDate.getDate() + (parseInt(duration) || 0));
    
    return dueDate;
  };

  // 格式化日期显示
  const formatDate = (date) => {
    if (!date) return 'N/A';
    
    // 确保我们有一个 JavaScript Date 对象
    const dateObj = date instanceof Date 
      ? date 
      : (date.toDate ? date.toDate() : new Date(date));
    
    // 使用 toLocaleDateString 格式化日期
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // 添加检查任务是否逾期的函数
  const isTaskOverdue = (task) => {
    if (task.status === 'completed') return false;
    
    const dueDate = calculateDueDate(task.start_date, task.duration);
    const today = new Date();
    
    // 移除时间部分以仅比较日期
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    
    return dueDate < today;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 border-4 border-emerald-500 dark:border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-700 dark:text-gray-300">Loading tasks...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md text-center">
          <div className="text-red-500 dark:text-red-400 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">Error Loading Tasks</h2>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Notification Modal */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-[9999] animate-slide-in-right">
          <div className={`p-4 rounded-lg shadow-lg max-w-md ${
            notification.type === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
            notification.type === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100' :
            notification.type === 'success' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100' :
            'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
          }`}>
            <div className="flex items-start">
              <div className="flex-shrink-0 mr-3">
                {notification.type === 'error' && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {notification.type === 'warning' && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
                {notification.type === 'success' && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {notification.type === 'info' && (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
              <div className="ml-4">
                <button
                  onClick={closeNotification}
                  className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-8">
          {/* Left Sidebar */}
          <div className="w-64 flex-shrink-0">
        <div className="sticky top-20"> {/* top-20 给顶部固定的 Header 留出空间 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50 max-h-[calc(100vh-5rem)] overflow-y-auto">
              <div className="p-4">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Status</h2>
                <div className="mt-4 space-y-2">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm cursor-pointer whitespace-nowrap ${
                      selectedStatus === filter.value 
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' 
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                      onClick={() => setSelectedStatus(filter.value)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(filter.value)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{filter.label}</span>
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-xs">
                        {tasks.filter((task) => (filter.value === 'all' ? true : 
                          filter.value === 'overdue' ? isTaskOverdue(task) : task.status === filter.value)).length}
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
                </div>
              </div>
            </div>
          </div>
          {/* Timeline View */}
          <div className="flex-1">
  <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/50">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Tasks Timeline</h2>
                  <div className="flex items-center space-x-4">
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Search tasks..."
                    />
          <button 
            className="!rounded-button px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer whitespace-nowrap flex items-center"
            onClick={() => setShowFilterModal(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
                      Filter
            {Object.values(filterOptions).some(value => value !== 'all') && (
              <span className="ml-1 bg-emerald-500 dark:bg-emerald-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {Object.values(filterOptions).filter(value => value !== 'all').length}
              </span>
            )}
                    </button>
          <button 
            className="!rounded-button px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer whitespace-nowrap flex items-center"
            onClick={() => setShowSortModal(true)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            Sort by: {sortOption.charAt(0).toUpperCase() + sortOption.slice(1)}
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ml-1 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
                    </button>
                  </div>
                </div>
                
                {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
          <p className="mt-4 text-gray-500 dark:text-gray-400 text-center">No tasks found. Create a new task to get started.</p>
                  </div>
      ) : sortedAndFilteredTasks.length === 0 ? (
                  <div className="py-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No tasks match your filter criteria.</p>
          <button
            onClick={resetFilters}
            className="mt-2 px-4 py-2 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors"
          >
            Reset Filters
          </button>
                  </div>
                ) : (
                  <div className="space-y-4">
          {sortedAndFilteredTasks.map((task) => (
                      <div
                        key={task.id}
              className="flex items-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-700/30 transition-shadow cursor-pointer bg-white dark:bg-gray-800"
                        draggable
                        onDragStart={() => handleDragStart(task)}
                        onClick={(e) => openTaskDetails(task, e)}
                      >
                        <div className={`w-1 h-16 ${task.bgColor} rounded-full mr-4`}></div>
                        <div className="flex-1">
                <div className="flex items-center">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.text}</h3>
                  {isTaskOverdue(task) && (
                    <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs rounded-full">
                      Overdue
                    </span>
                  )}
                </div>
                          {task.description && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.description}</p>
                          )}
                <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                  <span>Start {formatDate(task.start_date)}</span>
                            <span>•</span>
                            <span className={`${
                      task.priority === 'high' ? 'text-red-600 dark:text-red-400' : 
                      task.priority === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 
                      'text-emerald-600 dark:text-emerald-400'
                              }`}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
                            </span>
                            {task.progress > 0 && (
                              <>
                                <span>•</span>
                      <span className="text-blue-600 dark:text-blue-400">{task.progress}% Complete</span>
                              </>
                            )}
                          </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <span className="font-medium">Due:</span> {formatDate(calculateDueDate(task.start_date, task.duration))}
                        </div>
              </div>
              <div className="flex items-center">
                        {task.assignees && task.assignees.length > 0 && (
                  <div className="flex -space-x-2 mr-3">
                            {task.assignees.map((assignee, index) => (
                              <div 
                                key={assignee.uid || index} 
                        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center border border-white dark:border-gray-800"
                                title={assignee.displayName}
                              >
                                {assignee.displayName.charAt(0)}
                              </div>
                            ))}
                          </div>
                        )}
                {canEditTasks && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTask(task);
                        setEditedTask({...task});
                        setShowTaskDetails(true);
                        setIsEditing(true);
                      }}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                      title="Edit Task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const taskToDelete = task;
                        setSelectedTask(taskToDelete);
                        setTaskToDelete(taskToDelete);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors ml-1"
                      title="Delete Task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Task Details Modal */}
      {showTaskDetails && selectedTask && (
  <div className="fixed inset-0 bg-gray-500 dark:bg-gray-900/75 bg-opacity-75 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-gray-900/50 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                  <div className={`w-2 h-12 ${selectedTask.bgColor} rounded-full mr-4`}></div>
            {isEditing ? (
              <input
                type="text"
                name="text"
                value={editedTask.text}
                onChange={handleInputChange}
                className="text-xl font-bold text-gray-900 dark:text-gray-100 border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-emerald-500 w-full bg-transparent"
              />
            ) : (
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{selectedTask.text}</h2>
            )}
                </div>
                <button
                  onClick={closeTaskDetails}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="col-span-2">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</h3>
              {isEditing ? (
                <textarea
                  name="description"
                  value={editedTask.description || ""}
                  onChange={handleInputChange}
                  className="w-full h-32 p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Add a description..."
                />
              ) : (
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{selectedTask.description || "No description provided."}</p>
              )}
                  </div>

                    <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Assignees</h3>
              {isEditing ? (
                <div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editedTask.assignees && editedTask.assignees.map((assignee, index) => (
                      <div 
                        key={assignee.uid || index} 
                        className="flex items-center bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg"
                      >
                        <div className="w-6 h-6 rounded-full bg-emerald-200 dark:bg-emerald-700 flex items-center justify-center mr-2">
                          {assignee.displayName.charAt(0)}
                        </div>
                        <span className="text-sm text-emerald-800 dark:text-emerald-200">{assignee.displayName}</span>
                        <button
                          onClick={() => {
                            const updatedAssignees = [...editedTask.assignees];
                            updatedAssignees.splice(index, 1);
                            setEditedTask(prev => ({
                              ...prev,
                              assignees: updatedAssignees
                            }));
                          }}
                          className="ml-2 text-emerald-500 dark:text-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowAssigneeSelector(true)}
                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Assignee
                  </button>
                </div>
              ) : (
                      <div className="space-y-2">
                  {selectedTask.assignees && selectedTask.assignees.length > 0 ? (
                    selectedTask.assignees.map((assignee, index) => (
                          <div 
                            key={assignee.uid || index} 
                        className="flex items-center bg-gray-50 dark:bg-gray-700 p-2 rounded-lg"
                          >
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center mr-3">
                              {assignee.displayName.charAt(0)}
                            </div>
                            <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{assignee.displayName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{assignee.email}</p>
                            </div>
                          </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No assignees</p>
                  )}
                    </div>
                  )}
            </div>
                </div>

                <div className="space-y-6">
                  <div>
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</h3>
    {isEditing ? (
      <select
        name="status"
        value={editedTask.status || 'notStarted'}
        onChange={handleInputChange}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
      >
        <option value="notStarted">Pending</option>
        <option value="inProgress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
    ) : (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2 flex items-center">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedTask.status || 'notStarted')}`}>
          {getStatusLabel(selectedTask.status || 'notStarted')}
                      </span>
        {isTaskOverdue(selectedTask) && (
          <span className="ml-2 px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 text-xs rounded-full">
            Overdue
          </span>
        )}
                    </div>
    )}
                  </div>

                  <div>
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</h3>
    {isEditing ? (
      <div className="flex space-x-2">
        {['low', 'medium', 'high'].map(priority => (
          <button
            key={priority}
            type="button"
            onClick={() => handlePriorityChange(priority)}
            className={`px-3 py-1 rounded-lg text-sm ${
              editedTask.priority === priority
                ? priority === 'high' 
                  ? 'bg-red-500 text-white'
                  : priority === 'medium'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
            }`}
          >
            {priority.charAt(0).toUpperCase() + priority.slice(1)}
          </button>
        ))}
      </div>
    ) : (
                    <div className={`rounded-lg p-2 ${
                      selectedTask.priority === 'high' 
          ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200' 
                        : selectedTask.priority === 'medium'
            ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-200'
            : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                    }`}>
                      <span className="text-sm font-medium">
                        {selectedTask.priority.charAt(0).toUpperCase() + selectedTask.priority.slice(1)}
                      </span>
                    </div>
    )}
                  </div>

  <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date 111</h3>
      <p className="text-gray-800 dark:text-gray-200">
        {formatDate(selectedTask.start_date)}
      </p>
    </div>
    <div>
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</h3>
      <p className="text-gray-800 dark:text-gray-200">
        {formatDate(calculateDueDate(selectedTask.start_date, selectedTask.duration))}
      </p>
                    </div>
                  </div>

                  <div>
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Duration</h3>
    {isEditing ? (
      <input
        type="number"
        name="duration"
        min="1"
        value={editedTask.duration}
        onChange={handleInputChange}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
      />
    ) : (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
        <span className="text-sm text-gray-800 dark:text-gray-200">{selectedTask.duration} days</span>
                    </div>
    )}
                  </div>

                  <div>
    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</h3>
    {isEditing ? (
      <select
        name="type"
        value={editedTask.type}
        onChange={handleInputChange}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
      >
        <option value="task">Task</option>
        <option value="milestone">Milestone</option>
        <option value="feature">Feature</option>
        <option value="bug">Bug</option>
      </select>
    ) : (
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
        <span className="text-sm text-gray-800 dark:text-gray-200">
                        {selectedTask.type.charAt(0).toUpperCase() + selectedTask.type.slice(1)}
                      </span>
                    </div>
    )}
                  </div>


                    <div>
  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Progress</h3>
  {isEditing ? (
    <div>
      <input
        type="range"
        name="progress"
        min="0"
        max="100"
        value={editedTask.progress || 0}
        onChange={handleProgressChange}
        className="w-full dark:accent-emerald-500"
      />
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>0%</span>
        <span>{editedTask.progress || 0}%</span>
        <span>100%</span>
      </div>
    </div>
  ) : (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                          <div 
                            className="bg-emerald-500 h-2.5 rounded-full" 
          style={{ width: `${selectedTask.progress || 0}%` }}
                          ></div>
                        </div>
      <p className="text-sm text-right mt-1 text-gray-800 dark:text-gray-200">{selectedTask.progress || 0}%</p>
                      </div>
  )}
</div>
</div>
</div>

<div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Comments</h3>
  
  {/* 评论列表 */}
  <div className="space-y-4 mb-6 max-h-80 overflow-y-auto">
    {comments.length === 0 ? (
      <p className="text-gray-500 dark:text-gray-400 text-center py-4">No comments yet. Be the first to comment!</p>
    ) : (
      comments.map(comment => {
        // 找出对这条评论的所有回复
        const replies = comments.filter(c => c.replyTo && c.replyTo.id === comment.id);
        const isRootComment = !comment.replyTo;
        
        if (!isRootComment) return null; // 只渲染根评论，回复会在下面渲染
        
        return (
          <div key={comment.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            {/* 评论头部 */}
            <div className="flex items-start">
              <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center mr-3 flex-shrink-0">
                <span className="text-gray-800 dark:text-gray-200">{comment.createdBy.displayName.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{comment.createdBy.displayName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(comment.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => handleReply(comment)}
                    className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                  >
                    Reply
                  </button>
                </div>
                <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">{comment.text}</p>
              </div>
            </div>
            
            {/* 回复列表 */}
            {replies.length > 0 && (
              <div className="mt-3 pl-11 space-y-3">
                {replies.map(reply => (
                  <div key={reply.id} className="bg-white dark:bg-gray-600 rounded-lg p-3">
                    <div className="flex items-start">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center mr-2 flex-shrink-0">
                        <span className="text-gray-800 dark:text-gray-200">{reply.createdBy.displayName.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{reply.createdBy.displayName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-300">{formatDateTime(reply.createdAt)}</p>
                          </div>
                          <button
                            onClick={() => handleReply(comment)} // 回复原评论，而不是回复的回复
                            className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                          >
                            Reply
                          </button>
                        </div>
                        <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                          <span className="text-blue-600 dark:text-blue-400 font-medium">
                            @{reply.replyTo.createdBy.displayName}
                          </span>{' '}
                          {reply.text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                    </div>
                  )}
                </div>
        );
      })
    )}
              </div>

                
{/* 评论输入框 */}
<div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
  {replyTo && (
    <div className="mb-2 flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 p-2 rounded">
      <p className="text-sm text-blue-700 dark:text-blue-300">
        Replying to <span className="font-medium">@{replyTo.createdBy.displayName}</span>
      </p>
      <button
        onClick={cancelReply}
        className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )}
  <div className="flex items-start">
    <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center mr-3 flex-shrink-0">
      <span className="text-gray-800 dark:text-gray-200">
        {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || '?'}
      </span>
    </div>
    <div className="flex-1">
      <textarea
        id="comment-input"
        value={newComment}
        onChange={(e) => setNewComment(e.target.value)}
        placeholder={replyTo ? `Reply to ${replyTo.createdBy.displayName}...` : "Add a comment..."}
        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-600 dark:text-white resize-none"
        rows="2"
      />
      <div className="flex justify-end mt-2">
        <button
          onClick={handleAddComment}
          disabled={!newComment.trim() || isSubmittingComment}
          className={`px-4 py-1.5 rounded-lg text-white ${
            !newComment.trim() || isSubmittingComment
              ? 'bg-gray-400 dark:bg-gray-500 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700'
          } transition-colors flex items-center`}
        >
          {isSubmittingComment ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Posting...
            </>
          ) : (
            'Post Comment'
          )}
        </button>
      </div>
    </div>
  </div>
</div>
</div>

<div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Files & Attachments</h3>
    {isTaskAssignee() && (
      <label className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Upload File
        <input 
          type="file" 
          className="hidden" 
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </label>
    )}
  </div>
  
  {uploadError && (
    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 rounded-lg">
      {uploadError}
    </div>
  )}
  
  {isUploading && (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-700 dark:text-gray-300">Uploading...</span>
        <span className="text-sm text-gray-700 dark:text-gray-300">{Math.round(uploadProgress)}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
        <div 
          className="bg-emerald-500 h-2.5 rounded-full" 
          style={{ width: `${uploadProgress}%` }}
        ></div>
      </div>
    </div>
  )}
  
  {taskFiles.length === 0 ? (
    <div className="py-8 text-center bg-gray-50 dark:bg-gray-700 rounded-lg">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
      <p className="text-gray-500 dark:text-gray-400">No files attached to this task yet.</p>
      {isTaskAssignee() && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Click "Upload File" to add attachments.</p>
      )}
    </div>
  ) : (
    <div className="space-y-3">
      {taskFiles.map(file => (
        <div key={file.id} className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div className="mr-3 flex-shrink-0">
            {getFileIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <span>{formatFileSize(file.size)}</span>
              <span className="mx-1">•</span>
              <span>Uploaded by {file.uploadedBy.displayName}</span>
              <span className="mx-1">•</span>
              <span>{formatDateTime(file.uploadedAt)}</span>
            </div>
          </div>
          <div className="flex items-center ml-4">
            <button 
              onClick={async (e) => {
                e.preventDefault();
                // Create a temporary link element once
                const downloadLink = document.createElement('a');
                try {
                  // Fetch the file as a blob
                  const response = await fetch(file.url);
                  if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }
                  const blob = await response.blob();
                  
                  // Create an object URL for the blob
                  const blobUrl = window.URL.createObjectURL(blob);
                  
                  // Set attributes for the link
                  downloadLink.href = blobUrl;
                  downloadLink.download = file.name; // Set the desired filename
                  
                  // Append to body, click, and remove
                  document.body.appendChild(downloadLink);
                  downloadLink.click();
                  document.body.removeChild(downloadLink);
                  
                  // Revoke the object URL to free up memory
                  window.URL.revokeObjectURL(blobUrl);
                } catch (error) {
                  console.error('Error downloading file:', error);
                  // Optionally show a notification to the user
                  showNotification('Failed to download file. Please try again.', 'error');
                } finally {
                  // Clean up the link element even if there was an error before appendChild
                  if (downloadLink.parentNode === document.body) {
                      document.body.removeChild(downloadLink);
                  }
                }
              }}
              className="p-2 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full transition-colors"
              title="Download"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            {(isTaskAssignee() || (currentUser && file.uploadedBy.uid === currentUser.uid)) && (
              <button
                onClick={() => handleDeleteFile(file)}
                className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors ml-1"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )}
</div>

<div className="flex justify-end mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
  {isEditing ? (
    <>
      <button
        onClick={handleCancelEdit}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors mr-3 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        disabled={isSaving}
      >
        Cancel
      </button>
      <button
        onClick={handleSaveChanges}
        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors flex items-center dark:bg-emerald-600 dark:hover:bg-emerald-700"
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </>
        ) : (
          'Save Changes'
        )}
      </button>
    </>
  ) : (
    <>
      {canEditTasks && (
        <>
          <button
            onClick={handleDeleteTask}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors mr-auto dark:bg-red-600 dark:hover:bg-red-700"
            disabled={isSaving}
          >
            {isSaving ? 'Deleting...' : 'Delete Task'}
          </button>
          <button
            onClick={handleEditTask}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors mr-3 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            Edit Task
          </button>
        </>
      )}
                <button
                  onClick={closeTaskDetails}
        className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
                >
                  Close
                </button>
    </>
  )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Create Task Modal */}
      {showTaskModal && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl dark:bg-gray-800">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">New Creative Task</h2>
                <button
                  onClick={() => setShowTaskModal(false)}
            className="text-gray-400 hover:text-gray-500 cursor-pointer dark:text-gray-300 dark:hover:text-gray-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              {/* Add your form fields here */}
            </div>
          </div>
        </div>
      )}

{/* Delete Confirmation Modal */}
{showDeleteConfirm && taskToDelete && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-fade-in-down dark:bg-gray-800">
      <div className="text-center mb-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4 dark:bg-red-900/30">
          <svg className="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-white">Delete Task</h3>
        <p className="text-sm text-gray-500 dark:text-gray-300">
          Are you sure you want to delete the task "{taskToDelete.text}"? This action cannot be undone.
        </p>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={cancelDeleteTask}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          onClick={confirmDeleteTask}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center dark:bg-red-600 dark:hover:bg-red-700"
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deleting...
            </>
          ) : (
            'Delete Task'
          )}
        </button>
      </div>
    </div>
  </div>
)}
      {/* Filter Modal */}
{showFilterModal && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filter Tasks</h3>
        <button
          onClick={() => setShowFilterModal(false)}
          className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="space-y-4">
        {/* 优先级过滤器 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Priority</label>
          <select
            value={filterOptions.priority}
            onChange={(e) => handleFilterChange('priority', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-emerald-600"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        
        {/* 负责人过滤器 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Assignee</label>
          <select
            value={filterOptions.assignee}
            onChange={(e) => handleFilterChange('assignee', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-emerald-600"
          >
            <option value="all">All Assignees</option>
            {/* 这里可以动态生成团队成员列表 */}
            {currentUser && <option value={currentUser.uid}>Assigned to me</option>}
          </select>
        </div>
        
        {/* 截止日期过滤器 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Due Date</label>
          <select
            value={filterOptions.dueDate}
            onChange={(e) => handleFilterChange('dueDate', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-emerald-600"
          >
            <option value="all">All Dates</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due Today</option>
            <option value="thisWeek">Due This Week</option>
          </select>
        </div>
        
        {/* 进度过滤器 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Progress</label>
          <select
            value={filterOptions.progress}
            onChange={(e) => handleFilterChange('progress', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-emerald-600"
          >
            <option value="all">All Progress</option>
            <option value="notStarted">Not Started (0%)</option>
            <option value="inProgress">In Progress (1-99%)</option>
            <option value="completed">Completed (100%)</option>
          </select>
        </div>
      </div>
      
      <div className="mt-6 flex justify-end space-x-3">
        <button
          onClick={resetFilters}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Reset
        </button>
        <button
          onClick={() => setShowFilterModal(false)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          Apply Filters
        </button>
      </div>
    </div>
  </div>
)}
{/* Sort Modal */}
{showSortModal && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Sort Tasks</h3>
        <button
          onClick={() => setShowSortModal(false)}
          className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="space-y-2">
        <button
          onClick={() => handleSortChange('dueDate')}
          className={`w-full flex justify-between items-center p-3 rounded-md ${
            sortOption === 'dueDate' 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span>Due Date</span>
          {sortOption === 'dueDate' && (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        
        <button
          onClick={() => handleSortChange('priority')}
          className={`w-full flex justify-between items-center p-3 rounded-md ${
            sortOption === 'priority' 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span>Priority</span>
          {sortOption === 'priority' && (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        
        <button
          onClick={() => handleSortChange('progress')}
          className={`w-full flex justify-between items-center p-3 rounded-md ${
            sortOption === 'progress' 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span>Progress</span>
          {sortOption === 'progress' && (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        
        <button
          onClick={() => handleSortChange('title')}
          className={`w-full flex justify-between items-center p-3 rounded-md ${
            sortOption === 'title' 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <span>Title</span>
          {sortOption === 'title' && (
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${sortDirection === 'desc' ? 'transform rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
      
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setShowSortModal(false)}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          Apply Sorting
        </button>
      </div>
    </div>
  </div>
)}

{/* Assignee Selector Modal */}
{showAssigneeSelector && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Select Assignees</h3>
        <button
          onClick={() => setShowAssigneeSelector(false)}
          className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="max-h-60 overflow-y-auto mb-4">
        {teamMembers.length > 0 ? (
          <div className="space-y-2">
            {teamMembers.map(member => {
              const isSelected = selectedAssignees.some(assignee => assignee.uid === member.uid);
              return (
                <div 
                  key={member.uid} 
                  className={`flex items-center p-2 rounded-lg cursor-pointer ${
                    isSelected 
                      ? 'bg-emerald-50 dark:bg-emerald-900/30' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => handleAssigneeChange(member)}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                    isSelected 
                      ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-700 dark:text-emerald-100' 
                      : 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-100'
                  }`}>
                    {member.displayName.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      isSelected 
                        ? 'text-emerald-800 dark:text-emerald-300' 
                        : 'text-gray-800 dark:text-gray-200'
                    }`}>
                      {member.displayName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                  </div>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">No team members found</p>
        )}
      </div>
      
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setShowAssigneeSelector(false)}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
        <button
          onClick={saveAssignees}
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors dark:bg-emerald-600 dark:hover:bg-emerald-700"
        >
          Save
        </button>
      </div>
    </div>
  </div>
)}

{/* File Delete Confirmation Modal */}
{showFileDeleteConfirm && fileToDelete && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 dark:bg-gray-900 dark:bg-opacity-75">
    <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-fade-in-down dark:bg-gray-800">
      <div className="text-center mb-6">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4 dark:bg-red-900/30">
          <svg className="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-white">Delete File</h3>
        <p className="text-sm text-gray-500 dark:text-gray-300">
          Are you sure you want to delete the file "{fileToDelete.name}"? This action cannot be undone.
        </p>
      </div>
      <div className="flex justify-end space-x-3">
        <button
          onClick={cancelFileDelete}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          onClick={confirmDeleteFile}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center dark:bg-red-600 dark:hover:bg-red-700"
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deleting...
            </>
          ) : (
            'Delete File'
          )}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

// Add CSS for animation with Tailwind CSS
const styles = document.createElement('style');
styles.innerHTML = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .animate-slide-in-right {
    animation: slideInRight 0.3s ease-out forwards;
  }
`;
document.head.appendChild(styles);

export default Timeline;