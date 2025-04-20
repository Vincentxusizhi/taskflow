import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, Timestamp, onSnapshot, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Header from './Header';
import Timeline from './TimeLine';
import GanttChart from './GanttChart';

// 初始化 Firebase Functions
const functions = getFunctions();

const MainPage = () => {
  // 获取URL参数中的teamId
  const { teamId } = useParams();
  const navigate = useNavigate();
  
  // State to track active tab
  const [activeTab, setActiveTab] = useState('progress');
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' or 'gantt'
  const [showSidebar, setShowSidebar] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({
    text: '',
    description: '',
    start_date: Timestamp.fromDate(new Date()),
    duration: 1,
    type: 'task',
    priority: 'medium',
    progress: 0,
    assignees: []
  });
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const sidebarRef = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 添加存储用户所有团队的状态
  const [userTeams, setUserTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);

  // 获取团队数据
  const fetchTeamData = useCallback(async () => {
    if (!teamId) {
      console.log("No teamId provided");
      return;
    }
    
    try {
      console.log("Fetching team data for teamId:", teamId);
      const teamRef = doc(db, 'teams', teamId);
      const teamSnap = await getDoc(teamRef);
      
      if (teamSnap.exists()) {
        const data = teamSnap.data();
        console.log("Team data received:", data);
        
        // Ensure team data has a name
        if (!data.name) {
          console.warn("Team data missing name property");
        }
        
        setTeamData({
          id: teamId,
          ...data
        });
        
        // 获取团队成员信息
        if (data.membersData && Array.isArray(data.membersData)) {
          setTeamMembers(data.membersData);
        } else {
          console.warn("Team data missing membersData array");
          // If no members data in correct format, initialize as empty array
          setTeamMembers([]);
        }
      } else {
        console.error('Team not found');
        // 如果团队不存在，返回到团队列表页面
        navigate('/Teams');
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    }
  }, [teamId, navigate]);
  
  // 添加获取用户所有团队的函数
  const fetchUserTeams = async (userId) => {
    if (!userId) return;
    
    try {
      setLoadingTeams(true);
      
      // 查询用户所属的所有团队
      const teamsQuery = query(
        collection(db, 'teams'),
        where('members', 'array-contains', userId)
      );
      
      const teamsSnapshot = await getDocs(teamsQuery);
      
      const teams = [];
      teamsSnapshot.forEach((doc) => {
        teams.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // 按团队名称排序
      teams.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      });
      
      setUserTeams(teams);
    } catch (error) {
      console.error('Error fetching user teams:', error);
    } finally {
      setLoadingTeams(false);
    }
  };
  
  // 处理团队切换
  const handleTeamChange = (newTeamId) => {
    if (newTeamId && newTeamId !== teamId) {
      navigate(`/team/${newTeamId}/tasks`);
    }
  };

  // Fetch user data from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get user document from Firestore
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            // Combine auth user data with Firestore data
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: userSnap.data().displayName || user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100',
              ...userSnap.data()
            });
          } else {
            // Use auth data if Firestore document doesn't exist
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100'
            });
          }
          
          // 获取用户所有团队
          await fetchUserTeams(user.uid);
          
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Separate useEffect for fetching team data
  useEffect(() => {
    if (teamId) {
      console.log("Fetching team data due to teamId change:", teamId);
      fetchTeamData();
    }
  }, [teamId, navigate, fetchTeamData]);

  // Check team permissions
  useEffect(() => {
    const checkTeamPermissions = async () => {
      if (!teamId || !auth.currentUser) return;
      
      try {
        // Check if user is team admin
        const checkIsAdminFunction = httpsCallable(functions, 'checkIsTeamAdmin');
        const adminResult = await checkIsAdminFunction({ teamId });
        setIsAdmin(adminResult.data.isAdmin);
        
        // Check if user is team manager
        const checkIsManagerFunction = httpsCallable(functions, 'checkIsTeamManager');
        const managerResult = await checkIsManagerFunction({ teamId });
        setIsManager(managerResult.data.isManager);
        
        console.log('Team permissions:', { isAdmin: adminResult.data.isAdmin, isManager: managerResult.data.isManager });
      } catch (error) {
        console.error('Error checking team permissions:', error);
      }
    };
    
    checkTeamPermissions();
  }, [teamId]);

  // Handle clicks outside the sidebar to close it
  const handleOutsideClick = (e) => {
    if (sidebarRef.current && !sidebarRef.current.contains(e.target) && 
        e.target.classList.contains('sidebar-overlay')) {
      setShowSidebar(false);
    }
  };

  // Add ESC key listener to close sidebar
  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape' && showSidebar) {
        setShowSidebar(false);
      }
    };

    if (showSidebar) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [showSidebar]);

  // 处理创建任务
  const handleCreateTask = async (e) => {
    e.preventDefault();
    
    // 检查权限 - 只有管理员和经理可以创建任务
    if (!isAdmin && !isManager) {
      alert('You do not have permission to create tasks. Only team administrators and managers can create tasks.');
      return;
    }
    
    // 验证表单
    if (!newTask.text.trim()) {
      alert('Task name is required');
      return;
    }
    
    try {
      // 格式化开始日期
      let formattedStartDate = newTask.start_date;
      if (typeof newTask.start_date === 'string') {
        formattedStartDate = new Date(newTask.start_date).toISOString();
      } else if (formattedStartDate instanceof Timestamp) {
        formattedStartDate = formattedStartDate.toDate().toISOString();
      }
      
      // 创建任务数据
      const taskData = {
        text: newTask.text,
        description: newTask.description,
        start_date: formattedStartDate,
        duration: parseInt(newTask.duration) || 1,
        type: newTask.type,
        priority: newTask.priority,
        progress: newTask.progress,
        status: 'notStarted', // 使用新的状态值
        assignees: selectedAssignees.map(assignee => ({
          uid: assignee.uid,
          displayName: assignee.displayName,
          email: assignee.email
        }))
      };
      
      // 使用云函数创建任务
      const createTaskFunction = httpsCallable(functions, 'createTask');
      const result = await createTaskFunction({
        teamId: teamId,
        taskData: taskData
      });
      
      console.log('Task created successfully:', result.data);
      
      // 重置表单
      setNewTask({
        text: '',
        description: '',
        start_date: Timestamp.fromDate(new Date()),
        duration: 1,
        type: 'task',
        priority: 'medium',
        progress: 0,
        assignees: []
      });
      setSelectedAssignees([]);
      setShowCreateTaskModal(false);
      
      // 增加刷新键以触发视图刷新
      setRefreshKey(prevKey => prevKey + 1);
      
      // 刷新团队数据以更新任务列表
      fetchTeamData();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task. Please try again.');
    }
  };
  
  // 处理添加/删除任务负责人
  const toggleAssignee = (member) => {
    if (selectedAssignees.some(a => a.uid === member.uid)) {
      // 如果已选择，则移除
      setSelectedAssignees(selectedAssignees.filter(a => a.uid !== member.uid));
    } else {
      // 如果未选择，则添加
      setSelectedAssignees([...selectedAssignees, member]);
    }
  };
  
  // 切换视图模式
  const toggleViewMode = (mode) => {
    setViewMode(mode);
  };
  
  // Render component based on active tab and view mode
  const renderComponent = () => {
    if (!teamId) {
      console.log("renderComponent called without teamId");
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">No team selected. Please select a team to view tasks.</p>
        </div>
      );
    }
    
    console.log("Rendering component for teamId:", teamId, "activeTab:", activeTab, "viewMode:", viewMode);
    
    try {
      switch (activeTab) {
        case 'progress':
          return viewMode === 'timeline' 
            ? <Timeline key={`timeline-${teamId}`} teamId={teamId} refreshKey={refreshKey} />
            : <GanttChart key={`gantt-${teamId}`} teamId={teamId} refreshKey={refreshKey} />;
        default:
          return viewMode === 'timeline'
            ? <Timeline key={`timeline-${teamId}`} teamId={teamId} refreshKey={refreshKey} />
            : <GanttChart key={`gantt-${teamId}`} teamId={teamId} refreshKey={refreshKey} />;
      }
    } catch (error) {
      console.error("Error rendering component:", error);
      return (
        <div className="flex items-center justify-center h-64 bg-red-50">
          <div className="text-center p-6">
            <p className="text-red-500 font-medium mb-2">Error loading component</p>
            <p className="text-gray-600 text-sm">{error.message}</p>
          </div>
        </div>
      );
    }
  };

  // 渲染主页面
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <div className="pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div className="flex-1 min-w-0">
                {/* 添加团队选择器 */}
                <div className="flex items-center space-x-3">
                  <select
                    value={teamId || ''}
                    onChange={(e) => handleTeamChange(e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-emerald-300 focus:ring focus:ring-emerald-200 focus:ring-opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-2"
                    disabled={loadingTeams}
                  >
                    {loadingTeams ? (
                      <option>Loading teams...</option>
                    ) : userTeams.length === 0 ? (
                      <option>No teams available</option>
                    ) : (
                      userTeams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))
                    )}
                  </select>
                  
                  <h2 className="text-2xl font-bold leading-7 text-gray-900 dark:text-white sm:text-3xl sm:truncate mb-1">
                    Tasks
                  </h2>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                  {teamData && (
                    <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <i className="fas fa-users mr-1.5 text-gray-400 dark:text-gray-500"></i>
                      {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex">
                {(isAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Task
                  </button>
                )}
              </div>
            </div>
            
            {/* 视图切换选项卡 */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
              <div className="flex justify-between items-center">
                <div className="flex">
                  <button
                    onClick={() => toggleViewMode('timeline')}
                    className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                      viewMode === 'timeline'
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                    }`}
                  >
                    <i className="fas fa-stream mr-2"></i>
                    Timeline
                  </button>
                  <button
                    onClick={() => toggleViewMode('gantt')}
                    className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                      viewMode === 'gantt'
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                    }`}
                  >
                    <i className="fas fa-bars-progress mr-2"></i>
                    Gantt Chart
                  </button>
                </div>
              </div>
            </div>
            
            {/* 主内容区域 */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
              {renderComponent()}
            </div>
          </div>
        </div>
      </div>
      
      {/* 创建任务模态框 */}
      {showCreateTaskModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleCreateTask}>
                <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="w-full mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">
                        Create New Task
                      </h3>
                      <div className="mt-4 space-y-4">
                        <div>
                          <label htmlFor="task-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Task Name
                          </label>
                          <input
                            type="text"
                            name="task-name"
                            id="task-name"
                            value={newTask.text}
                            onChange={(e) => setNewTask({...newTask, text: e.target.value})}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="Enter task name"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Description
                          </label>
                          <textarea
                            id="task-description"
                            name="task-description"
                            rows="3"
                            value={newTask.description}
                            onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            placeholder="Task description"
                          ></textarea>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Start Date
                            </label>
                            <input
                              type="date"
                              name="start-date"
                              id="start-date"
                              value={newTask.start_date instanceof Timestamp 
                                ? new Date(newTask.start_date.seconds * 1000).toISOString().split('T')[0]
                                : typeof newTask.start_date === 'string' 
                                  ? newTask.start_date
                                  : new Date().toISOString().split('T')[0]
                              }
                              onChange={(e) => setNewTask({...newTask, start_date: e.target.value})}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                          </div>
                          <div>
                            <label htmlFor="duration" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Duration (days)
                            </label>
                            <input
                              type="number"
                              name="duration"
                              id="duration"
                              min="1"
                              value={newTask.duration}
                              onChange={(e) => setNewTask({...newTask, duration: e.target.value})}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Priority
                            </label>
                            <select
                              id="priority"
                              name="priority"
                              value={newTask.priority}
                              onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="task-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Type
                            </label>
                            <select
                              id="task-type"
                              name="task-type"
                              value={newTask.type}
                              onChange={(e) => setNewTask({...newTask, type: e.target.value})}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                              <option value="task">Task</option>
                              <option value="milestone">Milestone</option>
                              <option value="project">Project</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Assignees
                          </label>
                          <div className="mt-2 border border-gray-300 dark:border-gray-600 rounded-md p-2 max-h-40 overflow-y-auto">
                            {teamMembers.length > 0 ? (
                              teamMembers.map((member) => (
                                <div key={member.uid} className="flex items-center my-1">
                                  <input
                                    type="checkbox"
                                    id={`assignee-${member.uid}`}
                                    checked={selectedAssignees.some(a => a.uid === member.uid)}
                                    onChange={() => toggleAssignee(member)}
                                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded dark:bg-gray-700"
                                  />
                                  <label
                                    htmlFor={`assignee-${member.uid}`}
                                    className="ml-2 block text-sm text-gray-900 dark:text-gray-300"
                                  >
                                    {member.displayName || member.email}
                                  </label>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 dark:text-gray-400 text-sm">No team members found</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-emerald-600 text-base font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainPage;