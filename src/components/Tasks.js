import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, Timestamp, onSnapshot, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Header from './Header';
import Timeline from './TimeLine';
import Calendar from './Calendar';
import { logInfo, logError, logWarn } from '../utils/logger';


// initialize Firebase Functions
const functions = getFunctions();

const MainPage = () => {
  // get teamId from URL parameters
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
  
  // Task defaults from user settings
  const [userTaskDefaults, setUserTaskDefaults] = useState({
    defaultTaskPriority: 'medium',
    defaultTaskDuration: 1
  });
  
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
  
  
  const [userTeams, setUserTeams] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);
  // State for member list modal
  const [showMemberListModal, setShowMemberListModal] = useState(false);

  // fetch team data
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
        logInfo("Team data received:", {teamdata: data})
        
        // Ensure team data has a name
        if (!data.name) {
          console.warn("Team data missing name property");
          logWarn("Team data missing name property", {teamdata: data})
        }
        
        setTeamData({
          id: teamId,
          ...data
        });
        
        // get team members data
        if (data.membersData && Array.isArray(data.membersData)) {
          setTeamMembers(data.membersData);
        } else {
          console.warn("Team data missing membersData array");
          logWarn("Team data missing membersData array", {teamdata: data.memberData})
          // If no members data in correct format, initialize as empty array
          setTeamMembers([]);
        }
      } else {
        console.error('Team not found');
        // if team not found, go back to team list page
        navigate('/Teams');
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    }
  }, [teamId, navigate]);
  
  // add function to get all user's teams
  const fetchUserTeams = async (userId) => {
    if (!userId) return;
    
    try {
      setLoadingTeams(true);
      
      // query all teams that user belongs to
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
      
      // sort teams by name
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
  
  // handle team switch
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
            const userData = {
              uid: user.uid,
              email: user.email,
              displayName: userSnap.data().displayName || user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100',
              ...userSnap.data()
            };
            
            setUserData(userData);
            
            // Get task defaults if available
            if (userData.taskDefaults) {
              console.log("Loaded user task defaults:", userData.taskDefaults);
              setUserTaskDefaults(userData.taskDefaults);
              
              // Reset newTask with user defaults
              setNewTask(prev => ({
                ...prev,
                duration: userData.taskDefaults.defaultTaskDuration || 1,
                priority: userData.taskDefaults.defaultTaskPriority || 'medium'
              }));
            }
          } else {
            // Use auth data if Firestore document doesn't exist
            setUserData({
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'User',
              photoURL: user.photoURL || 'https://via.placeholder.com/100'
            });
          }
          
          // get all user's teams
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

  // handle open create task modal
  const handleOpenCreateTaskModal = () => {
    // Apply user default task settings when opening the modal
    setNewTask({
      text: '',
      description: '',
      start_date: Timestamp.fromDate(new Date()),
      duration: userTaskDefaults.defaultTaskDuration || 1,
      type: 'task',
      priority: userTaskDefaults.defaultTaskPriority || 'medium',
      progress: 0,
      assignees: []
    });
    setSelectedAssignees([]);
    setShowCreateTaskModal(true);
  };

  // handle create task
  const handleCreateTask = async (e) => {
    e.preventDefault();
    
    // check permission - only admins and managers can create tasks
    if (!isAdmin && !isManager) {
      alert('You do not have permission to create tasks. Only team administrators and managers can create tasks.');
      return;
    }
    
    // validate form
    if (!newTask.text.trim()) {
      alert('Task name is required');
      return;
    }
    
    try {
      // format start date
      let formattedStartDate = newTask.start_date;
      if (typeof newTask.start_date === 'string') {
        formattedStartDate = new Date(newTask.start_date).toISOString();
      } else if (formattedStartDate instanceof Timestamp) {
        formattedStartDate = formattedStartDate.toDate().toISOString();
      }
      
      // create task data
      const taskData = {
        text: newTask.text,
        description: newTask.description,
        start_date: formattedStartDate,
        duration: parseInt(newTask.duration) || 1,
        type: newTask.type,
        priority: newTask.priority,
        progress: newTask.progress,
        status: 'notStarted', // use new status value
        assignees: selectedAssignees.map(assignee => ({
          uid: assignee.uid,
          displayName: assignee.displayName,
          email: assignee.email
        }))
      };
      
      // use cloud function to create task
      const createTaskFunction = httpsCallable(functions, 'createTask');
      const result = await createTaskFunction({
        teamId: teamId,
        taskData: taskData
      });
      
      console.log('Task created successfully:', result.data);
      
      // reset form, use user default settings
      setNewTask({
        text: '',
        description: '',
        start_date: Timestamp.fromDate(new Date()),
        duration: userTaskDefaults.defaultTaskDuration || 1,
        type: 'task',
        priority: userTaskDefaults.defaultTaskPriority || 'medium',
        progress: 0,
        assignees: []
      });
      setSelectedAssignees([]);
      setShowCreateTaskModal(false);
      
      // increase refresh key to trigger view refresh
      setRefreshKey(prevKey => prevKey + 1);
      
      // refresh team data to update task list
      fetchTeamData();
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task. Please try again.');
    }
  };
  
  // handle add/remove task assignee
  const toggleAssignee = (member) => {
    if (selectedAssignees.some(a => a.uid === member.uid)) {
      // if already selected, remove
      setSelectedAssignees(selectedAssignees.filter(a => a.uid !== member.uid));
    } else {
      // if not selected, add
      setSelectedAssignees([...selectedAssignees, member]);
    }
  };
  
  // toggle view mode
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
            : <Calendar key={`gantt-${teamId}`} teamId={teamId} refreshKey={refreshKey} />;
        default:
          return viewMode === 'timeline'
            ? <Timeline key={`timeline-${teamId}`} teamId={teamId} refreshKey={refreshKey} />
            : <Calendar key={`gantt-${teamId}`} teamId={teamId} refreshKey={refreshKey} />;
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

  // render main page
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      
      <div className="pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div className="flex-1 min-w-0">
                {/* add team selector */}
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
                      {/* Button to open member list modal */}
                      <button 
                        onClick={() => setShowMemberListModal(true)}
                        className="ml-3 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 text-sm font-medium"
                      >
                        View Members
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex">
                {(isAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={handleOpenCreateTaskModal}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Task
                  </button>
                )}
              </div>
            </div>
            
            {/* view switch tabs */}
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
                    Calendar
                  </button>
                </div>
              </div>
            </div>
            
            {/* main content area */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
              {renderComponent()}
            </div>
          </div>
        </div>
      </div>
      
      {/* create task modal */}
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
                              {newTask.duration === userTaskDefaults.defaultTaskDuration && (
                                <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">(default)</span>
                              )}
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
                              {newTask.priority === userTaskDefaults.defaultTaskPriority && (
                                <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">(default)</span>
                              )}
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
                <div className="px-4 py-2 text-center text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                  You can change default task settings in your <a href="/settings" className="text-emerald-600 dark:text-emerald-400 hover:underline">Settings</a> page.
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Member List Modal */}
      {showMemberListModal && (
        <div className="fixed z-20 inset-0 overflow-y-auto" aria-labelledby="member-list-modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowMemberListModal(false)}></div>

            {/* Modal panel */}
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 sm:mx-0 sm:h-10 sm:w-10">
                    <i className="fas fa-users text-emerald-600 dark:text-emerald-400"></i>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="member-list-modal-title">
                      Team Members ({teamMembers.length})
                    </h3>
                    <div className="mt-4 max-h-80 overflow-y-auto pr-2">
                      {teamMembers.length > 0 ? (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                          {teamMembers.map((member) => (
                            <li key={member.uid} className="py-3 flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                  {member.photoURL ? (
                                    <img className="h-full w-full rounded-full object-cover" src={member.photoURL} alt={member.displayName} />
                                  ) : (
                                    <span className="text-gray-500 dark:text-gray-300 font-medium">
                                      {member.displayName?.charAt(0).toUpperCase() || member.email?.charAt(0).toUpperCase() || 'U'}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.displayName}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                                </div>
                              </div>
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ 
                                member.role === 'admin' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 
                                member.role === 'manager' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 
                                'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' 
                              }`}>
                                {member.role ? member.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-4">No members found in this team.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setShowMemberListModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainPage;